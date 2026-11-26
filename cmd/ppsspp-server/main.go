package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"mime"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
)

func init() {
	_ = mime.AddExtensionType(".mjs", "text/javascript; charset=utf-8")
	_ = mime.AddExtensionType(".wasm", "application/wasm")
	_ = mime.AddExtensionType(".data", "application/octet-stream")
}

const (
	manifestMagic        uint32 = 0x4D534656
	transitionLogMagic   uint32 = 0x54534656
	transitionLogVersion uint8  = 1
	transitionHdrSize           = 16
	defaultMaxLogBytes   int64  = 64 * 1024 * 1024
	defaultTelemetryRPM         = 60
	maxTelemetryBody            = 262144
)

var validGameID = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,64}$`)

type gameEntry struct {
	ID         string `json:"id"`
	Title      string `json:"title"`
	Platform   string `json:"platform"`
	Cover      string `json:"cover,omitempty"`
	DiscSize   int64  `json:"discSize"`
	BlockShift uint8  `json:"blockShift,omitempty"`
	PoolMB     uint8  `json:"poolMb,omitempty"`
	DataDir    string `json:"dataDir,omitempty"`
}

type catalog struct {
	Version int         `json:"version"`
	Games   []gameEntry `json:"games"`
}

type manifestHeader struct {
	TotalBlocks     uint32
	ArchiveByteSize uint64
	BuildEtagHash   uint64
	BlockShift      uint8
	NeighborIDBytes uint8
	PackShift       uint8
	DefaultPoolMB   uint8
}

func decodeManifestHeader(b []byte) (manifestHeader, error) {
	if len(b) < 32 || binary.LittleEndian.Uint32(b[0:4]) != manifestMagic {
		return manifestHeader{}, errors.New("invalid manifest magic")
	}
	if binary.LittleEndian.Uint16(b[4:6]) != 1 {
		return manifestHeader{}, errors.New("unsupported manifest version")
	}
	topK := binary.LittleEndian.Uint16(b[6:8])
	h := manifestHeader{
		ArchiveByteSize: binary.LittleEndian.Uint64(b[8:16]),
		BuildEtagHash:   binary.LittleEndian.Uint64(b[16:24]),
		TotalBlocks:     binary.LittleEndian.Uint32(b[24:28]),
		BlockShift:      b[28],
		NeighborIDBytes: b[29],
		PackShift:       b[30],
		DefaultPoolMB:   b[31],
	}
	if topK < 1 || topK > 16 || (h.BlockShift != 16 && h.BlockShift != 18 && h.BlockShift != 19) ||
		(h.NeighborIDBytes != 2 && h.NeighborIDBytes != 4) || h.PackShift > (28-h.BlockShift) ||
		h.TotalBlocks < 1 || len(b) != 32+int(h.TotalBlocks)*int(topK)*int(h.NeighborIDBytes) {
		return manifestHeader{}, errors.New("invalid manifest layout")
	}
	return h, nil
}

type packHandle struct {
	file    *os.File
	size    int64
	modTime time.Time
}

type gameSnapshot struct {
	header          manifestHeader
	manifestBytes   []byte
	manifestETag    string
	buildEtagHex    string
	quotedBuildEtag string
	packHandles     map[string]packHandle
	logMu           sync.Mutex
	logFile         *os.File
	logSize         int64
}

type rootSnapshot struct {
	mu           sync.RWMutex
	closed       bool
	rootGame     *gameSnapshot
	games        map[string]*gameSnapshot
	catalogBytes []byte
}

type clientWindow struct {
	start time.Time
	count int
}

type server struct {
	dataDir        string
	transitionsDir string
	webHandler     http.Handler
	coresHandler   http.Handler
	maxLogBytes    int64
	telemetryRPM   int
	active         atomic.Pointer[rootSnapshot]
	limiterMu      sync.Mutex
	limiters       map[string]*clientWindow
}

func loadGameSnapshot(dir, transitionsDir string) (*gameSnapshot, error) {
	mBytes, err := os.ReadFile(filepath.Join(dir, "manifest.bin"))
	if err != nil {
		return nil, err
	}
	hdr, err := decodeManifestHeader(mBytes)
	if err != nil {
		return nil, err
	}

	var packCount uint32 = 1
	if hdr.PackShift > 0 {
		bPerPack := uint32(1) << hdr.PackShift
		packCount = (hdr.TotalBlocks + bPerPack - 1) / bPerPack
	}

	packs := make(map[string]packHandle, packCount)
	closePacks := func() {
		for _, p := range packs {
			_ = p.file.Close()
		}
	}
	for idx := uint32(0); idx < packCount; idx++ {
		name := fmt.Sprintf("pak_%016x_%04d.bin", hdr.BuildEtagHash, idx)
		f, err := os.Open(filepath.Join(dir, name))
		if err != nil {
			closePacks()
			return nil, err
		}
		st, err := f.Stat()
		if err != nil {
			_ = f.Close()
			closePacks()
			return nil, err
		}
		packs[name] = packHandle{file: f, size: st.Size(), modTime: st.ModTime()}
	}

	if err := os.MkdirAll(transitionsDir, 0755); err != nil {
		closePacks()
		return nil, err
	}
	logPath := filepath.Join(transitionsDir, fmt.Sprintf("transitions_%016x.log", hdr.BuildEtagHash))
	lf, err := os.OpenFile(logPath, os.O_CREATE|os.O_RDWR|os.O_APPEND, 0644)
	if err != nil {
		closePacks()
		return nil, err
	}
	st, err := lf.Stat()
	if err != nil {
		_ = lf.Close()
		closePacks()
		return nil, err
	}
	logSize := st.Size()
	if logSize < transitionHdrSize {
		if err := lf.Truncate(0); err != nil {
			_ = lf.Close()
			closePacks()
			return nil, err
		}
		var th [transitionHdrSize]byte
		binary.LittleEndian.PutUint32(th[0:4], transitionLogMagic)
		th[4] = transitionLogVersion
		th[5] = hdr.NeighborIDBytes
		binary.LittleEndian.PutUint64(th[8:16], hdr.BuildEtagHash)
		if _, err := lf.Write(th[:]); err != nil {
			_ = lf.Close()
			closePacks()
			return nil, err
		}
		logSize = transitionHdrSize
	} else {
		var th [transitionHdrSize]byte
		if _, err := lf.ReadAt(th[:], 0); err != nil ||
			binary.LittleEndian.Uint32(th[0:4]) != transitionLogMagic ||
			th[4] != transitionLogVersion ||
			th[5] != hdr.NeighborIDBytes ||
			binary.LittleEndian.Uint64(th[8:16]) != hdr.BuildEtagHash {
			_ = lf.Close()
			closePacks()
			return nil, errors.New("transition log header mismatch")
		}
	}

	sum := sha256.Sum256(mBytes)
	etagHex := fmt.Sprintf("%016x", hdr.BuildEtagHash)
	return &gameSnapshot{
		header:          hdr,
		manifestBytes:   mBytes,
		manifestETag:    `"` + hex.EncodeToString(sum[:]) + `"`,
		buildEtagHex:    etagHex,
		quotedBuildEtag: `"` + etagHex + `"`,
		packHandles:     packs,
		logFile:         lf,
		logSize:         logSize,
	}, nil
}

func (g *gameSnapshot) close() {
	g.logMu.Lock()
	if g.logFile != nil {
		_ = g.logFile.Sync()
		_ = g.logFile.Close()
		g.logFile = nil
	}
	g.logMu.Unlock()
	for _, p := range g.packHandles {
		_ = p.file.Close()
	}
	g.packHandles = nil
}

func (s *server) loadSnapshot() (*rootSnapshot, error) {
	snap := &rootSnapshot{games: make(map[string]*gameSnapshot)}
	if rootGame, err := loadGameSnapshot(s.dataDir, s.transitionsDir); err == nil {
		snap.rootGame = rootGame
	}

	catBytes, err := os.ReadFile(filepath.Join(s.dataDir, "games.json"))
	if err == nil {
		var cat catalog
		if err := json.Unmarshal(catBytes, &cat); err != nil || cat.Version < 1 || len(cat.Games) == 0 {
			snap.closeAll()
			return nil, errors.New("invalid games.json")
		}
		loadedGames := make([]gameEntry, 0, len(cat.Games))
		seenEtags := make(map[uint64]string, len(cat.Games))
		for _, g := range cat.Games {
			if !validGameID.MatchString(g.ID) || g.Title == "" || g.DiscSize <= 0 || g.Platform != "psp" {
				snap.closeAll()
				return nil, fmt.Errorf("invalid catalog entry %q", g.ID)
			}
			subDir := filepath.Join(s.dataDir, "games", g.ID)
			if g.DataDir != "" {
				if filepath.IsAbs(g.DataDir) {
					subDir = g.DataDir
				} else {
					subDir = filepath.Join(s.dataDir, g.DataDir)
				}
			}
			gs, err := loadGameSnapshot(subDir, s.transitionsDir)
			if err != nil {
				log.Printf("server: warning, failed to load game %q: %v", g.ID, err)
				continue
			}
			if prevID, dup := seenEtags[gs.header.BuildEtagHash]; dup {
				gs.close()
				snap.closeAll()
				return nil, fmt.Errorf("duplicate BuildEtagHash %s between %q and %q", gs.buildEtagHex, prevID, g.ID)
			}
			seenEtags[gs.header.BuildEtagHash] = g.ID
			snap.games[g.ID] = gs
			loadedGames = append(loadedGames, g)
		}
		cat.Games = loadedGames
		snap.catalogBytes, _ = json.Marshal(cat)
	} else {
		if snap.rootGame == nil {
			return nil, fmt.Errorf("no games.json or manifest.bin in %s", s.dataDir)
		}
		cat := catalog{
			Version: 1,
			Games: []gameEntry{{
				ID:         "default",
				Title:      "PSP UMD Disc",
				Platform:   "psp",
				DiscSize:   int64(snap.rootGame.header.ArchiveByteSize),
				BlockShift: snap.rootGame.header.BlockShift,
				PoolMB:     snap.rootGame.header.DefaultPoolMB,
			}},
		}
		snap.catalogBytes, _ = json.MarshalIndent(cat, "", "  ")
	}

	if snap.rootGame == nil && len(snap.games) == 0 {
		return nil, fmt.Errorf("no valid game snapshots loaded from %s", s.dataDir)
	}
	return snap, nil
}

func (r *rootSnapshot) closeAll() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.closed = true
	if r.rootGame != nil {
		r.rootGame.close()
		r.rootGame = nil
	}
	for _, g := range r.games {
		g.close()
	}
	r.games = nil
}

func (s *server) acquire() *rootSnapshot {
	for {
		snap := s.active.Load()
		if snap == nil {
			return nil
		}
		snap.mu.RLock()
		if !snap.closed {
			return snap
		}
		snap.mu.RUnlock()
	}
}

func (s *server) serveManifest(w http.ResponseWriter, r *http.Request, g *gameSnapshot) {
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("ETag", g.manifestETag)
	http.ServeContent(w, r, "manifest.bin", time.Time{}, bytes.NewReader(g.manifestBytes))
}

func (s *server) servePack(w http.ResponseWriter, r *http.Request, g *gameSnapshot, name string) {
	h, ok := g.packHandles[name]
	if !ok {
		http.NotFound(w, r)
		return
	}
	r.Header.Del("If-Range")
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	w.Header().Set("ETag", g.quotedBuildEtag)
	http.ServeContent(w, r, name, h.modTime, io.NewSectionReader(h.file, 0, h.size))
}

func (s *server) allowTelemetry(ip string) bool {
	s.limiterMu.Lock()
	defer s.limiterMu.Unlock()
	now := time.Now()
	w, ok := s.limiters[ip]
	if ok && now.Sub(w.start) <= time.Minute {
		if w.count >= s.telemetryRPM {
			return false
		}
		w.count++
		return true
	}
	if !ok && len(s.limiters) >= 4096 {
		var oldestKey string
		var oldestTime time.Time
		for k, entry := range s.limiters {
			if now.Sub(entry.start) > time.Minute {
				delete(s.limiters, k)
			} else if oldestKey == "" || entry.start.Before(oldestTime) {
				oldestKey = k
				oldestTime = entry.start
			}
		}
		if len(s.limiters) >= 4096 && oldestKey != "" {
			delete(s.limiters, oldestKey)
		}
	}
	s.limiters[ip] = &clientWindow{start: now, count: 1}
	return true
}

func (s *server) handleTelemetry(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		ip = r.RemoteAddr
	}
	if !s.allowTelemetry(ip) {
		http.Error(w, "Too Many Requests", http.StatusTooManyRequests)
		return
	}
	snap := s.acquire()
	if snap == nil {
		http.Error(w, "server closed", http.StatusServiceUnavailable)
		return
	}
	defer snap.mu.RUnlock()

	build := strings.Trim(r.URL.Query().Get("build"), `"`)
	var target *gameSnapshot
	if snap.rootGame != nil && strings.EqualFold(build, snap.rootGame.buildEtagHex) {
		target = snap.rootGame
	} else {
		for _, g := range snap.games {
			if strings.EqualFold(build, g.buildEtagHex) {
				target = g
				break
			}
		}
	}
	if target == nil {
		http.Error(w, "Conflict", http.StatusConflict)
		return
	}

	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxTelemetryBody))
	if err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			http.Error(w, "Request Entity Too Large", http.StatusRequestEntityTooLarge)
			return
		}
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}

	recSize := int(target.header.NeighborIDBytes) * 2
	if len(body) == 0 || len(body)%recSize != 0 {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}

	valid := make([]byte, 0, len(body))
	for off := 0; off < len(body); off += recSize {
		var prev, curr uint32
		if recSize == 8 {
			prev = binary.LittleEndian.Uint32(body[off+4 : off+8])
			curr = binary.LittleEndian.Uint32(body[off : off+4])
		} else {
			prev = uint32(binary.LittleEndian.Uint16(body[off+2 : off+4]))
			curr = uint32(binary.LittleEndian.Uint16(body[off : off+2]))
		}
		if prev != curr && prev < target.header.TotalBlocks && curr < target.header.TotalBlocks {
			valid = append(valid, body[off:off+recSize]...)
		}
	}
	if len(valid) == 0 {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	target.logMu.Lock()
	defer target.logMu.Unlock()
	if target.logSize+int64(len(valid)) > s.maxLogBytes {
		http.Error(w, "Insufficient Storage", http.StatusInsufficientStorage)
		return
	}
	if _, err := target.logFile.Write(valid); err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
	target.logSize += int64(len(valid))
	w.WriteHeader(http.StatusAccepted)
}

func (s *server) handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Range, If-None-Match, Content-Type")
		w.Header().Set("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges, ETag")
		w.Header().Set("Cross-Origin-Resource-Policy", "cross-origin")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		clean := path.Clean(r.URL.Path)
		switch {
		case clean == "/games.json" || clean == "/api/games":
			snap := s.acquire()
			if snap == nil {
				http.Error(w, "server closed", http.StatusServiceUnavailable)
				return
			}
			defer snap.mu.RUnlock()
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			w.Header().Set("Cache-Control", "no-cache")
			_, _ = w.Write(snap.catalogBytes)
		case clean == "/manifest.bin":
			snap := s.acquire()
			if snap == nil {
				http.Error(w, "server closed", http.StatusServiceUnavailable)
				return
			}
			defer snap.mu.RUnlock()
			if snap.rootGame == nil {
				http.NotFound(w, r)
				return
			}
			s.serveManifest(w, r, snap.rootGame)
		case strings.HasPrefix(clean, "/packs/"):
			snap := s.acquire()
			if snap == nil {
				http.Error(w, "server closed", http.StatusServiceUnavailable)
				return
			}
			defer snap.mu.RUnlock()
			if snap.rootGame == nil {
				http.NotFound(w, r)
				return
			}
			s.servePack(w, r, snap.rootGame, strings.TrimPrefix(clean, "/packs/"))
		case strings.HasPrefix(clean, "/games/"):
			parts := strings.Split(strings.TrimPrefix(clean, "/games/"), "/")
			snap := s.acquire()
			if snap == nil {
				http.Error(w, "server closed", http.StatusServiceUnavailable)
				return
			}
			defer snap.mu.RUnlock()
			g, ok := snap.games[parts[0]]
			if !ok {
				http.NotFound(w, r)
				return
			}
			if len(parts) == 2 && parts[1] == "manifest.bin" {
				s.serveManifest(w, r, g)
				return
			}
			if len(parts) == 3 && parts[1] == "packs" {
				s.servePack(w, r, g, parts[2])
				return
			}
			http.NotFound(w, r)
		case clean == "/telemetry/transitions":
			s.handleTelemetry(w, r)
		case s.coresHandler != nil && strings.HasPrefix(clean, "/cores/"):
			w.Header().Set("Cross-Origin-Opener-Policy", "same-origin")
			w.Header().Set("Cross-Origin-Embedder-Policy", "require-corp")
			s.coresHandler.ServeHTTP(w, r)
		case s.webHandler != nil:
			w.Header().Set("Cross-Origin-Opener-Policy", "same-origin")
			w.Header().Set("Cross-Origin-Embedder-Policy", "require-corp")
			s.webHandler.ServeHTTP(w, r)
		default:
			http.NotFound(w, r)
		}
	})
}

func main() {
	addr := flag.String("addr", ":8080", "TCP listen address")
	dataDir := flag.String("data-dir", "./dist", "Directory containing games.json / manifest.bin")
	transitionsDir := flag.String("transitions-dir", "./transitions", "Directory for transition logs")
	webDir := flag.String("web-dir", "", "Optional static web root")
	coresDir := flag.String("cores-dir", "./cores", "Directory containing compiled emulator cores")
	maxLogBytes := flag.Int64("max-log-bytes", defaultMaxLogBytes, "Max bytes per transition log")
	telemetryRPM := flag.Int("telemetry-rpm", defaultTelemetryRPM, "Per-IP telemetry rate limit")
	flag.Parse()

	s := &server{
		dataDir:        *dataDir,
		transitionsDir: *transitionsDir,
		maxLogBytes:    *maxLogBytes,
		telemetryRPM:   *telemetryRPM,
		limiters:       make(map[string]*clientWindow),
	}
	if *webDir != "" {
		s.webHandler = http.FileServer(http.Dir(*webDir))
	}
	if *coresDir != "" {
		s.coresHandler = http.StripPrefix("/cores/", http.FileServer(http.Dir(*coresDir)))
	}
	snap, err := s.loadSnapshot()
	if err != nil {
		log.Fatalf("server init failed: %v", err)
	}
	s.active.Store(snap)

	httpSrv := &http.Server{
		Addr:              *addr,
		Handler:           s.handler(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	ctx, cancel := context.WithCancel(context.Background())
	sigCh := make(chan os.Signal, 2)
	signal.Notify(sigCh, os.Interrupt, syscall.SIGTERM, syscall.SIGHUP)
	go func() {
		for sig := range sigCh {
			if sig == syscall.SIGHUP {
				if next, err := s.loadSnapshot(); err != nil {
					log.Printf("reload failed: %v", err)
				} else if prev := s.active.Swap(next); prev != nil {
					go prev.closeAll()
				}
				continue
			}
			cancel()
			return
		}
	}()

	errCh := make(chan error, 1)
	go func() {
		fmt.Printf("ppsspp-server listening on %s (data-dir=%s)\n", *addr, *dataDir)
		if err := httpSrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
		close(errCh)
	}()

	select {
	case <-ctx.Done():
		sCtx, sCancel := context.WithTimeout(context.Background(), 5*time.Second)
		_ = httpSrv.Shutdown(sCtx)
		sCancel()
	case err := <-errCh:
		if err != nil {
			log.Fatalf("HTTP error: %v", err)
		}
	}
	if cur := s.active.Swap(nil); cur != nil {
		cur.closeAll()
	}
}
