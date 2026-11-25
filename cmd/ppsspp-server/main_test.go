package main

import (
	"bytes"
	"encoding/binary"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
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
