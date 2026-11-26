package main

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func writeTestGame(t *testing.T, dir string, etag uint64, payload []byte) {
	t.Helper()
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	var m [34]byte
	binary.LittleEndian.PutUint32(m[0:4], manifestMagic)
	binary.LittleEndian.PutUint16(m[4:6], 1)
	binary.LittleEndian.PutUint16(m[6:8], 1)
	binary.LittleEndian.PutUint64(m[8:16], uint64(len(payload)))
	binary.LittleEndian.PutUint64(m[16:24], etag)
	binary.LittleEndian.PutUint32(m[24:28], 1)
	m[28] = 16
	m[29] = 2
	m[30] = 0
	m[31] = 16
	binary.LittleEndian.PutUint16(m[32:34], 0xFFFF)

	if err := os.WriteFile(filepath.Join(dir, "manifest.bin"), m[:], 0644); err != nil {
		t.Fatal(err)
	}
	packName := "pak_" + hex16(etag) + "_0000.bin"
	if err := os.WriteFile(filepath.Join(dir, packName), payload, 0644); err != nil {
		t.Fatal(err)
	}
}

func hex16(v uint64) string {
	const digits = "0123456789abcdef"
	var buf [16]byte
	for i := 15; i >= 0; i-- {
		buf[i] = digits[v&0xF]
		v >>= 4
	}
	return string(buf[:])
}

func TestMultiGamePspRoutesAndRangeServing(t *testing.T) {
	tmp := t.TempDir()
	dataDir := filepath.Join(tmp, "dist")
	transDir := filepath.Join(tmp, "transitions")
	webDir := filepath.Join(tmp, "web")
	if err := os.MkdirAll(webDir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(webDir, "index.html"), []byte("ok"), 0644); err != nil {
		t.Fatal(err)
	}

	payload := make([]byte, 65536)
	copy(payload[0x8000:], "\x01CD001")
	writeTestGame(t, filepath.Join(dataDir, "games", "gow_coo"), 0x1122334455667788, payload)

	gamesJSON := `{"version":1,"games":[{"id":"gow_coo","title":"God of War: Chains of Olympus","platform":"psp","discSize":65536}]}`
	if err := os.WriteFile(filepath.Join(dataDir, "games.json"), []byte(gamesJSON), 0644); err != nil {
		t.Fatal(err)
	}

	s := &server{
		dataDir:        dataDir,
		transitionsDir: transDir,
		webHandler:     http.FileServer(http.Dir(webDir)),
		maxLogBytes:    defaultMaxLogBytes,
		telemetryRPM:   defaultTelemetryRPM,
		limiters:       make(map[string]*clientWindow),
	}
	snap, err := s.loadSnapshot()
	if err != nil {
		t.Fatalf("loadSnapshot failed: %v", err)
	}
	defer snap.closeAll()
	s.active.Store(snap)

	ts := httptest.NewServer(s.handler())
	defer ts.Close()

	res, err := http.Get(ts.URL + "/games.json")
	if err != nil || res.StatusCode != 200 {
		t.Fatalf("GET /games.json failed: %v %v", res, err)
	}
	res.Body.Close()

	req, _ := http.NewRequest("GET", ts.URL+"/games/gow_coo/packs/pak_1122334455667788_0000.bin", nil)
	req.Header.Set("Range", "bytes=32768-32773")
	req.Header.Set("If-Range", `"stale-etag"`)
	res, err = http.DefaultClient.Do(req)
	if err != nil || res.StatusCode != http.StatusPartialContent {
		t.Fatalf("expected 206, got %v err=%v", res, err)
	}
	var got bytes.Buffer
	_, _ = got.ReadFrom(res.Body)
	res.Body.Close()
	if got.String() != "\x01CD001" {
		t.Fatalf("range body = %q, want \\x01CD001", got.String())
	}

	res, err = http.Get(ts.URL + "/index.html")
	if err != nil || res.Header.Get("Cross-Origin-Opener-Policy") != "same-origin" {
		t.Fatalf("missing COOP header: %v", err)
	}
	res.Body.Close()
}

func TestCatalogFiltersBrokenGamesAndRejectsDuplicateEtag(t *testing.T) {
	tmp := t.TempDir()
	dataDir := filepath.Join(tmp, "dist")
	transDir := filepath.Join(tmp, "transitions")

	payload := make([]byte, 65536)
	writeTestGame(t, filepath.Join(dataDir, "games", "good_game"), 0x1111222233334444, payload)
	// broken_game has no manifest.bin on disk
	gamesJSON := `{"version":1,"games":[
		{"id":"good_game","title":"Good Game","platform":"psp","discSize":65536},
		{"id":"broken_game","title":"Broken Game","platform":"psp","discSize":65536}
	]}`
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dataDir, "games.json"), []byte(gamesJSON), 0644); err != nil {
		t.Fatal(err)
	}

	s := &server{
		dataDir:        dataDir,
		transitionsDir: transDir,
		maxLogBytes:    defaultMaxLogBytes,
		telemetryRPM:   defaultTelemetryRPM,
		limiters:       make(map[string]*clientWindow),
	}
	snap, err := s.loadSnapshot()
	if err != nil {
		t.Fatalf("loadSnapshot failed: %v", err)
	}
	defer snap.closeAll()

	var cat catalog
	if err := json.Unmarshal(snap.catalogBytes, &cat); err != nil {
		t.Fatalf("unmarshal filtered catalog: %v", err)
	}
	if len(cat.Games) != 1 || cat.Games[0].ID != "good_game" {
		t.Fatalf("expected only good_game in filtered catalog, got %+v", cat.Games)
	}

	// Duplicate BuildEtagHash across two games must be rejected
	writeTestGame(t, filepath.Join(dataDir, "games", "dup_game"), 0x1111222233334444, payload)
	dupJSON := `{"version":1,"games":[
		{"id":"good_game","title":"Good Game","platform":"psp","discSize":65536},
		{"id":"dup_game","title":"Dup Game","platform":"psp","discSize":65536}
	]}`
	if err := os.WriteFile(filepath.Join(dataDir, "games.json"), []byte(dupJSON), 0644); err != nil {
		t.Fatal(err)
	}
	if badSnap, err := s.loadSnapshot(); err == nil {
		badSnap.closeAll()
		t.Fatalf("expected error for duplicate BuildEtagHash across games")
	}
}

func TestTelemetryValidationRateLimitAndCoresHeaders(t *testing.T) {
	tmp := t.TempDir()
	dataDir := filepath.Join(tmp, "dist")
	transDir := filepath.Join(tmp, "transitions")
	coresDir := filepath.Join(tmp, "cores")
	if err := os.MkdirAll(filepath.Join(coresDir, "ppsspp"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(coresDir, "ppsspp", "core.wasm"), []byte("wasm"), 0644); err != nil {
		t.Fatal(err)
	}

	payload := make([]byte, 131072)
	const etag = uint64(0xaabbccddeeff0011)
	writeTestGame(t, filepath.Join(dataDir, "games", "g1"), etag, payload)
	// writeTestGame writes TotalBlocks=1; overwrite with TotalBlocks=2 so prev!=curr is valid
	var m [36]byte
	binary.LittleEndian.PutUint32(m[0:4], manifestMagic)
	binary.LittleEndian.PutUint16(m[4:6], 1)
	binary.LittleEndian.PutUint16(m[6:8], 1)
	binary.LittleEndian.PutUint64(m[8:16], uint64(len(payload)))
	binary.LittleEndian.PutUint64(m[16:24], etag)
	binary.LittleEndian.PutUint32(m[24:28], 2)
	m[28] = 16
	m[29] = 2
	m[30] = 0
	m[31] = 16
	binary.LittleEndian.PutUint16(m[32:34], 0xFFFF)
	binary.LittleEndian.PutUint16(m[34:36], 0xFFFF)
	if err := os.WriteFile(filepath.Join(dataDir, "games", "g1", "manifest.bin"), m[:], 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dataDir, "games.json"), []byte(`{"version":1,"games":[{"id":"g1","title":"G1","platform":"psp","discSize":131072}]}`), 0644); err != nil {
		t.Fatal(err)
	}

	s := &server{
		dataDir:        dataDir,
		transitionsDir: transDir,
		coresHandler:   http.StripPrefix("/cores/", http.FileServer(http.Dir(coresDir))),
		maxLogBytes:    transitionHdrSize + 8, // Allow two 4-byte records
		telemetryRPM:   2,
		limiters:       make(map[string]*clientWindow),
	}
	snap, err := s.loadSnapshot()
	if err != nil {
		t.Fatalf("loadSnapshot: %v", err)
	}
	defer snap.closeAll()
	s.active.Store(snap)

	ts := httptest.NewServer(s.handler())
	defer ts.Close()

	// /cores/ COOP/COEP headers
	res, err := http.Get(ts.URL + "/cores/ppsspp/core.wasm")
	if err != nil || res.StatusCode != 200 {
		t.Fatalf("GET /cores/ failed: %v %v", res, err)
	}
	if res.Header.Get("Cross-Origin-Opener-Policy") != "same-origin" ||
		res.Header.Get("Cross-Origin-Embedder-Policy") != "require-corp" {
		t.Fatalf("missing COOP/COEP on /cores/: %v", res.Header)
	}
	res.Body.Close()

	// Bad record length -> 400
	res, err = http.Post(ts.URL+"/telemetry/transitions?build=aabbccddeeff0011", "application/octet-stream", bytes.NewReader([]byte{1, 2, 3}))
	if err != nil || res.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 for bad record length, got %v %v", res, err)
	}
	res.Body.Close()

	// Valid record (curr=1, prev=0) -> 202
	rec := []byte{1, 0, 0, 0}
	res, err = http.Post(ts.URL+"/telemetry/transitions?build=aabbccddeeff0011", "application/octet-stream", bytes.NewReader(rec))
	if err != nil || res.StatusCode != http.StatusAccepted {
		t.Fatalf("expected 202, got %v %v", res, err)
	}
	res.Body.Close()

	// 3rd request from same IP -> 429
	res, err = http.Post(ts.URL+"/telemetry/transitions?build=aabbccddeeff0011", "application/octet-stream", bytes.NewReader(rec))
	if err != nil || res.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("expected 429, got %v %v", res, err)
	}
	res.Body.Close()

	// Rate limiter sweeps expired entries before evicting active IPs
	s.limiterMu.Lock()
	s.limiters = make(map[string]*clientWindow, 4096)
	s.limiters["active-spammer"] = &clientWindow{start: time.Now(), count: 2}
	for i := 0; i < 4095; i++ {
		s.limiters[fmt.Sprintf("expired-%d", i)] = &clientWindow{start: time.Now().Add(-2 * time.Minute), count: 1}
	}
	s.limiterMu.Unlock()

	if !s.allowTelemetry("brand-new-ip") {
		t.Fatalf("expected brand-new-ip to be allowed")
	}
	if s.allowTelemetry("active-spammer") {
		t.Fatalf("expected active-spammer NOT to be evicted while expired entries existed")
	}

	// Reset limiter and verify 507 when exceeding maxLogBytes
	s.limiterMu.Lock()
	s.limiters = make(map[string]*clientWindow)
	s.limiterMu.Unlock()
	twoRecs := strings.Repeat("\x01\x00\x00\x00", 2) // 8 bytes -> total 16+4+8 > 16+8
	res, err = http.Post(ts.URL+"/telemetry/transitions?build=aabbccddeeff0011", "application/octet-stream", strings.NewReader(twoRecs))
	if err != nil || res.StatusCode != http.StatusInsufficientStorage {
		t.Fatalf("expected 507 when exceeding maxLogBytes, got %v %v", res, err)
	}
	res.Body.Close()
}
