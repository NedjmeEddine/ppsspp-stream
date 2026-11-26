# Dossier: memstick-opfs-bridge

Evidence lane: docs. Raw technical claims only (no verdicts).

```yaml:claim
id: MO-D01
axis: "memstick-opfs-bridge"
claim: "Emscripten's default filesystem is MEMFS mounted at /, which is strictly in-memory and loses all written data on page reload."
url: https://emscripten.org/docs/api_reference/Filesystem-API.html
anchor: "All files exist strictly in-memory, and any data written to them is lost when the page is reloaded."
receipt: "version:7.0.2-git"
```

```yaml:claim
id: MO-D02
axis: "memstick-opfs-bridge"
claim: "Emscripten FS.syncfs() is asynchronous and, among built-in filesystems, only IDBFS implements the synchronization interface; MEMFS does not."
url: https://emscripten.org/docs/api_reference/Filesystem-API.html
anchor: "Currently, only the IDBFS file system implements the interfaces needed for synchronization."
receipt: "version:7.0.2-git"
```

```yaml:claim
id: MO-D03
axis: "memstick-opfs-bridge"
claim: "IDBFS supports an autoPersist mount option that automatically writes directory-tree changes to the IndexedDB backend, avoiding manual FS.syncfs calls."
url: https://emscripten.org/docs/api_reference/Filesystem-API.html
anchor: "If the mount option autoPersist: true is passed when mounting IDBFS, then whenever any changes are made to the IDBFS directory tree"
receipt: "version:7.0.2-git"
```



```yaml:claim
id: MO-D05
axis: "memstick-opfs-bridge"
claim: "The Emscripten WASMFS build setting is WASMFS, enabled with -sWASMFS=1, and defaults to false."
url: https://emscripten.org/docs/tools_reference/settings_reference.html
anchor: "If set to 1, uses new filesystem implementation."
receipt: "version:7.0.2-git"
```

```yaml:claim
id: MO-D06
axis: "memstick-opfs-bridge"
claim: "WasmFS is compiled to WebAssembly with full multithreading support, whereas the old JS filesystem proxies filesystem operations to the main thread in pthreads builds."
url: https://emscripten.org/docs/api_reference/Filesystem-API.html
anchor: "WasmFS, instead, is compiled to Wasm and has full multithreading support."
receipt: "version:7.0.2-git"
```





```yaml:claim
id: MO-D09
axis: "memstick-opfs-bridge"
claim: "The published Emscripten docs site is labelled 7.0.2-git (dev), not a pinned 7.0.0 release, so a locally pinned toolchain must capture the exact commit rather than relying on the docs version string."
url: https://emscripten.org/docs/tools_reference/settings_reference.html
anchor: "Emscripten 7.0.2-git (dev) documentation"
receipt: "version:7.0.2-git"
escalate: true
```

```yaml:claim
id: MO-D10
axis: "memstick-opfs-bridge"
claim: "FileSystemSyncAccessHandle is confined to dedicated Web Workers precisely so its synchronous methods cannot block the main thread."
url: https://developer.mozilla.org/en-US/docs/Web/API/FileSystemSyncAccessHandle
anchor: "This class is only accessible inside dedicated Web Workers (so that its methods do not block execution on the main thread)"
receipt: "docs:2025-04-09"
```

```yaml:claim
id: MO-D11
axis: "memstick-opfs-bridge"
claim: "flush() persists writes to disk on demand and is the explicit durability point for a dirty OPFS file."
url: https://developer.mozilla.org/en-US/docs/Web/API/FileSystemSyncAccessHandle
anchor: "Persists any changes made to the file associated with the handle via the write() method to disk."
receipt: "docs:2025-04-09"
```

```yaml:claim
id: MO-D12
axis: "memstick-opfs-bridge"
claim: "close() releases the exclusive OPFS file lock and disables further operations on the sync handle."
url: https://developer.mozilla.org/en-US/docs/Web/API/FileSystemSyncAccessHandle
anchor: "releasing the exclusive lock previously put on the file associated with the file handle."
receipt: "docs:2025-04-09"
```

```yaml:claim
id: MO-D13
axis: "memstick-opfs-bridge"
claim: "createSyncAccessHandle() throws NoModificationAllowedError when the browser cannot acquire the file lock, e.g. a second handle in readwrite mode."
url: https://developer.mozilla.org/en-US/docs/Web/API/FileSystemFileHandle/createSyncAccessHandle
anchor: "Thrown if the browser is not able to acquire a lock on the file associated with the file handle."
receipt: "docs:main"
```

```yaml:claim
id: MO-D14
axis: "memstick-opfs-bridge"
claim: "In readwrite mode only one sync handle can exist per OPFS file; a later open throws until the first handle is closed."
url: https://developer.mozilla.org/en-US/docs/Web/API/FileSystemFileHandle/createSyncAccessHandle
anchor: "Attempting to open subsequent handles before the first handle is closed results in a"
receipt: "docs:main"
escalate: true
```

```yaml:claim
id: MO-D15
axis: "memstick-opfs-bridge"
claim: "The SQLite WASM opfs-sahpool VFS was added in SQLite v3.43."
url: https://www.sqlite.org/wasm/doc/trunk/persistence.md
anchor: "The \"opfs-sahpool\" (\"sah\" = SyncAccessHandle) VFS is a OPFS-based"
receipt: "version:3.43"
```

```yaml:claim
id: MO-D16
axis: "memstick-opfs-bridge"
claim: "opfs-sahpool does not require COOP/COEP headers and is the highest-performance OPFS backend SQLite WASM offers, but it has no filesystem transparency."
url: https://www.sqlite.org/wasm/doc/trunk/persistence.md
anchor: "Does not require COOP/COEP HTTP headers (and associated restrictions)."
receipt: "version:3.43"
```



```yaml:claim
id: MO-D18
axis: "memstick-opfs-bridge"
claim: "opfs-sahpool clearOnInit defaults to false and must only be enabled for data that need not survive a page reload."
url: https://www.sqlite.org/wasm/doc/trunk/persistence.md
anchor: "Use this only for databases which need not survive a page reload."
receipt: "version:3.54"
```

```yaml:claim
id: MO-D19
axis: "memstick-opfs-bridge"
claim: "opfs-sahpool initialCapacity should be at least twice the expected file count to accommodate journal files."
url: https://www.sqlite.org/wasm/doc/trunk/persistence.md
anchor: "This number needs to be at least twice the number of expected database files (to account for journal files)"
receipt: "version:3.54"
```

```yaml:claim
id: MO-D20
axis: "memstick-opfs-bridge"
claim: "As of SQLite 3.50, pauseVfs() relinquishes all SAHs so another instance in a different tab/page/Worker can take them over; unpauseVfs() reacquires them."
url: https://www.sqlite.org/wasm/doc/trunk/persistence.md
anchor: "\"Pausing\" the VFS disassociates it from SQLite and relinquishes its SAHs so that they may be opened by another instance of this VFS"
receipt: "version:3.50"
```

```yaml:claim
id: MO-D21
axis: "memstick-opfs-bridge"
claim: "SQLite's standard OPFS VFS requires SharedArrayBuffer, which needs COOP same-origin and COEP require-corp headers or the VFS will not load."
url: https://www.sqlite.org/wasm/doc/trunk/persistence.md
anchor: "JavaScript's SharedArrayBuffer type is required for the OPFS VFS"
receipt: "version:3.54"
escalate: true
```

```yaml:claim
id: MO-D22
axis: "memstick-opfs-bridge"
claim: "SQLite WASM states OPFS is available only in Worker-thread contexts, not the main UI thread."
url: https://www.sqlite.org/wasm/doc/trunk/persistence.md
anchor: "OPFS is only available in Worker-thread contexts, not the main UI thread."
receipt: "version:3.54"
```

```yaml:claim
id: MO-D23
axis: "memstick-opfs-bridge"
claim: "SQLite WASM's opfs VFS exclusively locks an OPFS file via a sync access handle, so a second tab opening the same database hits a locking error."
url: https://www.sqlite.org/wasm/doc/trunk/persistence.md
anchor: "If the same page is opened in two tabs, the second tab will hit a locking error"
receipt: "version:3.54"
escalate: true
```

```yaml:claim
id: MO-D24
axis: "memstick-opfs-bridge"
claim: "SQLite WASM lock acquisition retries several times then surfaces SQLITE_BUSY or a generic I/O error, and recommends never using two handles to the same db file in one thread."
url: https://www.sqlite.org/wasm/doc/trunk/persistence.md
anchor: "Never use two database handles to the same db file within the same thread, as that can hypothetically lead to certain deadlock situations."
receipt: "version:3.54"
```

```yaml:claim
id: MO-D25
axis: "memstick-opfs-bridge"
claim: "SQLite's SQLite-over-WASMFS backend exposes OPFS as a mount-point directory on the Emscripten virtual filesystem and requires a custom build."
url: https://www.sqlite.org/wasm/doc/trunk/persistence.md
anchor: "It exposes OPFS as a \"mount point\" (directory) on the virtual filesystem"
receipt: "version:3.43"
escalate: true
```



```yaml:claim
id: MO-D27
axis: "memstick-opfs-bridge"
claim: "Emscripten WASMFS OPFS support is not in canonical SQLite builds and requires a local source checkout plus a recent emsdk on Linux."
url: https://www.sqlite.org/wasm/doc/trunk/persistence.md
anchor: "requires a separate, less portable WASM"
receipt: "version:3.43"
escalate: true
```



```yaml:claim
id: MO-D29
axis: "memstick-opfs-bridge"
claim: "WAL mode for OPFS-hosted SQLite databases (3.47+) requires pragma locking_mode=exclusive and gives no concurrency benefit for the opfs/opfs-wl VFSes."
url: https://www.sqlite.org/wasm/doc/trunk/persistence.md
anchor: "pragma locking_mode=exclusive"
receipt: "version:3.47"
```





```yaml:claim
id: MO-D32
axis: "memstick-opfs-bridge"
claim: "MDN recommends visibilitychange over pagehide as the end-of-session signal because pagehide is not reliably fired."
url: https://developer.mozilla.org/en-US/docs/Web/API/Window/pagehide_event
anchor: "The best event to use to signal the end of a user's session is the visibilitychange event."
receipt: "docs:2026-10-26"
```

```yaml:claim
id: MO-D33
axis: "memstick-opfs-bridge"
claim: "pagehide is bfcache-compatible but unreliable on mobile, so a durability hook cannot assume it fires on tab close."
url: https://developer.mozilla.org/en-US/docs/Web/API/Window/pagehide_event
anchor: "Like the unload and beforeunload events, this event is not reliably fired by browsers, especially on mobile."
receipt: "docs:2026-10-26"
```

```yaml:claim
id: MO-D34
axis: "memstick-opfs-bridge"
claim: "Cross-origin isolation requires COOP same-origin plus COEP require-corp (or credentialless), and enables SharedArrayBuffer with high-resolution timers."
url: https://developer.mozilla.org/en-US/docs/Web/API/Window/crossoriginisolated
anchor: "A document will be cross-origin isolated if it is returned with an HTTP response that includes the headers:"
receipt: "docs:main"
escalate: true
```

```yaml:claim
id: MO-R01
axis: "memstick-opfs-bridge"
claim: "PPSSPP's host Memory Stick adapter performs POSIX writes with write(hFile, pointer, size) and notifies a write-generation counter; there is no fsync on the save write path."
url: "https://raw.githubusercontent.com/hrydgard/ppsspp/7744761b0e6a708181c8a7585c6712b663ff8acc/Core/FileSystems/DirectoryFileSystem.cpp"
anchor: "bytesWritten = write(hFile, pointer, size);"
receipt: "commit:7744761b0e6a708181c8a7585c6712b663ff8acc"
```

```yaml:claim
id: MO-R02
axis: "memstick-opfs-bridge"
claim: "PPSSPP's DirectoryFileHandle::Close() applies deferred truncation via ftruncate() and then close(), making file close the only durability boundary in this host adapter."
url: "https://raw.githubusercontent.com/hrydgard/ppsspp/7744761b0e6a708181c8a7585c6712b663ff8acc/Core/FileSystems/DirectoryFileSystem.cpp"
anchor: "if (ftruncate(hFile, (off_t)needsTrunc_) != 0) {"
receipt: "commit:7744761b0e6a708181c8a7585c6712b663ff8acc"
```

```yaml:claim
id: MO-R03
axis: "memstick-opfs-bridge"
claim: "MemoryStick_NotifyWrite() only increments memstickWriteGeneration to invalidate cached free-space; it performs no storage flush or write-back."
url: "https://raw.githubusercontent.com/hrydgard/ppsspp/7744761b0e6a708181c8a7585c6712b663ff8acc/Core/HW/MemoryStick.cpp"
anchor: "memstickWriteGeneration++;"
receipt: "commit:7744761b0e6a708181c8a7585c6712b663ff8acc"
```

```yaml:claim
id: MO-R04
axis: "memstick-opfs-bridge"
claim: "PPSSPP already partitions the virtual Memory Stick by game ID: directory listings under SAVEDATA explicitly hide another game's save directories, and free-space accounting prefixes savedata scan with gameID."
url: "https://raw.githubusercontent.com/hrydgard/ppsspp/7744761b0e6a708181c8a7585c6712b663ff8acc/Core/FileSystems/DirectoryFileSystem.cpp"
anchor: "Don't let it see savedata from other games, it can misinterpret stuff."
receipt: "commit:7744761b0e6a708181c8a7585c6712b663ff8acc"
```

```yaml:claim
id: MO-R05
axis: "memstick-opfs-bridge"
claim: "PPSSPP's memory-stick free-space scan passes gameID as a directory prefix to File::GetFilesInDir, so per-game save isolation is a guest-visible filesystem contract, not only a host cache concern."
url: "https://raw.githubusercontent.com/hrydgard/ppsspp/7744761b0e6a708181c8a7585c6712b663ff8acc/Core/HW/MemoryStick.cpp"
anchor: "nullptr, 0, gameID);  // gameID as directory prefix."
receipt: "commit:7744761b0e6a708181c8a7585c6712b663ff8acc"
```

```yaml:claim
id: MO-R06
axis: "memstick-opfs-bridge"
claim: "PPSSPP's MemoryStick_Shutdown() blocks on an asynchronously spawned size promise, an example of a bounded wait moved to teardown rather than the emulation frame."
url: "https://raw.githubusercontent.com/hrydgard/ppsspp/7744761b0e6a708181c8a7585c6712b663ff8acc/Core/HW/MemoryStick.cpp"
anchor: "g_initialMemstickSizePromise->BlockUntilReady();"
receipt: "commit:7744761b0e6a708181c8a7585c6712b663ff8acc"
```

```yaml:claim
id: MO-R07
axis: "memstick-opfs-bridge"
claim: "Emscripten's default filesystem is MEMFS, mounted at / by staticInit(); it is strictly in-memory and loses all writes on page reload."
url: "https://emscripten.org/docs/api_reference/Filesystem-API.html"
anchor: "All files exist strictly in-memory, and any data written to them is lost when the page is reloaded."
receipt: "docs:7.0.0-git"
```

```yaml:claim
id: MO-R08
axis: "memstick-opfs-bridge"
claim: "Emscripten's FS.trackingDelegate is compiled in only under the FS_DEBUG flag, so it cannot be relied on for dirty-file tracking in release builds."
url: "https://raw.githubusercontent.com/emscripten-core/emscripten/7.0.0/src/lib/libfs.js"
anchor: "trackingDelegate: {},"
receipt: "version:7.0.0"
escalate: true
```

```yaml:claim
id: MO-R09
axis: "memstick-opfs-bridge"
claim: "Emscripten IDBFS autoPersist injects stream_ops.write to set node.isModified and stream_ops.close to queue an IndexedDB persist, i.e. dirty write-back on close()."
url: "https://raw.githubusercontent.com/emscripten-core/emscripten/7.0.0/src/lib/libidbfs.js"
anchor: "IDBFS.queuePersist(n.idbfs_mount);"
receipt: "version:7.0.0"
```

```yaml:claim
id: MO-R10
axis: "memstick-opfs-bridge"
claim: "IDBFS autoPersist debounces persistence with setTimeout(startPersist, 0) to batch all modifications in a frame, and queues another sync ('again') if new writes arrive during an in-flight sync."
url: "https://raw.githubusercontent.com/emscripten-core/emscripten/7.0.0/src/lib/libidbfs.js"
anchor: "mount.idbPersistState = setTimeout(startPersist, 0);"
receipt: "version:7.0.0"
```

```yaml:claim
id: MO-R11
axis: "memstick-opfs-bridge"
claim: "Emscripten rejects -lidbfs (IDBFS) entirely when WASMFS is enabled, so IDBFS-style autoPersist write-back is not available on a WASMFS OPFS build."
url: "https://raw.githubusercontent.com/emscripten-core/emscripten/7.0.0/src/lib/libidbfs.js"
anchor: "using -lidbfs is not currently supported in WasmFS."
receipt: "version:7.0.0"
escalate: true
```

```yaml:claim
id: MO-R12
axis: "memstick-opfs-bridge"
claim: "Emscripten's WasmFS OPFS backend asserts it cannot be created on the main browser thread without Asyncify or JSPI, forcing OPFS filesystem work into a worker/proxy context."
url: "https://raw.githubusercontent.com/emscripten-core/emscripten/7.0.0/system/lib/wasmfs/backends/opfs_backend.cpp"
anchor: "Cannot safely create OPFS backend on main browser thread without Asyncify or JSPI"
receipt: "version:7.0.0"
escalate: true
```

```yaml:claim
id: MO-R13
axis: "memstick-opfs-bridge"
claim: "In pthread builds Emscripten proxies every WasmFS OPFS operation to a dedicated worker and signals completion with emscripten_proxy_finish rather than awaiting the JS promise, keeping synchronous C file I/O off the main thread."
url: "https://raw.githubusercontent.com/emscripten-core/emscripten/7.0.0/src/lib/libwasmfs_opfs.js"
anchor: "Under PTHREADS the wasmfs_opfs_* functions never suspend since they are"
receipt: "version:7.0.0"
```

```yaml:claim
id: MO-R14
axis: "memstick-opfs-bridge"
claim: "WasmFS OPFS exposes an explicit flush() that maps to FileSystemSyncAccessHandle.flush(); errors are reported as -EIO, giving a C-visible fsync-like durability point."
url: "https://raw.githubusercontent.com/emscripten-core/emscripten/7.0.0/src/lib/libwasmfs_opfs.js"
anchor: "await accessHandle.flush();"
receipt: "version:7.0.0"
```

```yaml:claim
id: MO-R15
axis: "memstick-opfs-bridge"
claim: "Emscripten 7.0.0 WasmFS OPFS uses {mode:'readwrite-unsafe'} sync access handles when supported; Firefox and Safari do not support the mode option and silently return exclusive handles, detected via a getter probe."
url: "https://github.com/emscripten-core/emscripten/commit/a580618aba0865504e4b447c23889b96874a3a9f"
anchor: "Browsers without support for `mode` (Firefox and Safari currently)"
receipt: "commit:a580618aba0865504e4b447c23889b96874a3a9f"
escalate: true
```

```yaml:claim
id: MO-R16
axis: "memstick-opfs-bridge"
claim: "With readwrite-unsafe handles, unlink or rename of a WasmFS OPFS file that still has an open read-only fd fails with EIO in Chromium, so save-slot replacement while a handle is open is a failure mode."
url: "https://github.com/emscripten-core/emscripten/commit/a580618aba0865504e4b447c23889b96874a3a9f"
anchor: "`unlink` or `rename` on a file that has an open read-only fd fails with"
receipt: "commit:a580618aba0865504e4b447c23889b96874a3a9f"
escalate: true
```

```yaml:claim
id: MO-R17
axis: "memstick-opfs-bridge"
claim: "WasmFS OPFS maps NoModificationAllowedError / InvalidStateError from createSyncAccessHandle to -EACCES; contention on a save file surfaces as a filesystem error, not a silent success."
url: "https://raw.githubusercontent.com/emscripten-core/emscripten/7.0.0/src/lib/libwasmfs_opfs.js"
anchor: "e.name === 'NoModificationAllowedError') {"
receipt: "version:7.0.0"
```

```yaml:claim
id: MO-R18
axis: "memstick-opfs-bridge"
claim: "SQLite's opfs-sahpool VFS was added in 3.43: highest OPFS performance and no COOP/COEP requirement, but no filesystem transparency (client names map to virtual names) and no multiple simultaneous connections to the same database."
url: "https://sqlite.org/wasm/doc/trunk/persistence.md"
anchor: "Does not support multiple simultaneous connections to the same"
receipt: "version:3.43"
escalate: true
```

```yaml:claim
id: MO-R19
axis: "memstick-opfs-bridge"
claim: "SQLite opfs-sahpool initialization fails for the second and subsequent instances in the same origin (e.g. a second tab), so a per-game save VFS cannot be blindly installed on game switch."
url: "https://sqlite.org/wasm/doc/trunk/persistence.md"
anchor: "e.g. via two tabs to the same origin, will fail for the second and"
receipt: "version:3.43"
escalate: true
```

```yaml:claim
id: MO-R20
axis: "memstick-opfs-bridge"
claim: "SQLite's opfs-sahpool owns its OPFS directory exclusively: all files in it are assumed VFS-managed and may be deleted or modified by the VFS, so a shared /saves/${gameId}/ directory must not hold unrelated files."
url: "https://sqlite.org/wasm/doc/trunk/persistence.md"
anchor: "Do not place other files in this directory, as they may be"
receipt: "version:3.43"
escalate: true
```

```yaml:claim
id: MO-R21
axis: "memstick-opfs-bridge"
claim: "As of SQLite 3.54, opfs-sahpool wipes its storage automatically when initialization fails (now optional but on by default), a data-loss coupling that conflicts with never deleting a game's saves on cache invalidation."
url: "https://sqlite.org/wasm/doc/trunk/persistence.md"
anchor: "automatically if initialization of the storage fails"
receipt: "version:3.54"
escalate: true
```

```yaml:claim
id: MO-R22
axis: "memstick-opfs-bridge"
claim: "SQLite opfs-sahpool gained a cooperative pauseVfs()/unpauseVfs() capability in 3.50 to relinquish and reacquire sync access handles so another tab or worker can own the pool."
url: "https://sqlite.org/wasm/doc/trunk/persistence.md"
anchor: "capability to help support cooperative concurrency."
receipt: "version:3.50"
```

```yaml:claim
id: MO-R23
axis: "memstick-opfs-bridge"
claim: "SQLite WAL over OPFS (3.47+) requires pragma locking_mode=exclusive because WASM lacks shared memory, and provides no concurrency benefit; it eliminates concurrency in the opfs and opfs-wl VFSes."
url: "https://sqlite.org/wasm/doc/trunk/persistence.md"
anchor: "pragma locking_mode=exclusive"
receipt: "version:3.47"
```

```yaml:claim
id: MO-R24
axis: "memstick-opfs-bridge"
claim: "SQLite states OPFS is only available in Worker contexts, not the main UI thread, and its WASMFS+OPFS build is entirely unsupported, needs a custom build, and does not work from the main thread."
url: "https://sqlite.org/wasm/doc/trunk/persistence.md"
anchor: "OPFS is only available in Worker-thread contexts, not the main UI"
receipt: "version:3.43"
escalate: true
```

```yaml:claim
id: MO-R25
axis: "memstick-opfs-bridge"
claim: "MDN documents pagehide as not reliably fired (especially on mobile) and recommends visibilitychange as the end-of-session signal; pagehide is bfcache-compatible and event.persisted indicates reuse."
url: "https://developer.mozilla.org/en-US/docs/Web/API/Window/pagehide_event"
anchor: "The best event to use to signal the end of a user's session is the visibilitychange event."
receipt: "docs:MDN-2026-10-26"
```

```yaml:claim
id: MO-R26
axis: "memstick-opfs-bridge"
claim: "MDN states FileSystemSyncAccessHandle is only accessible in dedicated Web Workers so synchronous methods do not block the main thread, and close() releases the exclusive file lock."
url: "https://developer.mozilla.org/en-US/docs/Web/API/FileSystemSyncAccessHandle"
anchor: "This class is only accessible inside dedicated Web Workers (so that its methods do not block execution on the main thread)"
receipt: "docs:MDN-2025-04-09"
```

```yaml:claim
id: MO-R27
axis: "memstick-opfs-bridge"
claim: "MDN defines flush() on FileSystemSyncAccessHandle as persisting write() changes to disk, making it the explicit durability barrier distinct from close()."
url: "https://developer.mozilla.org/en-US/docs/Web/API/FileSystemSyncAccessHandle"
anchor: "Persists any changes made to the file associated with the handle via the write() method to disk."
receipt: "docs:MDN-2025-04-09"
```

```yaml:claim
id: MO-R28
axis: "memstick-opfs-bridge"
claim: "The public opfs-vfs project defaults to balanced durability with ~150 ms debounced sync after the first dirty change, explicitly warns this is not a maximum data-loss window, and requires fsync()/flushVfs() at save boundaries."
url: "https://raw.githubusercontent.com/opfs-vfs/opfs-vfs/cc371426211fdcb250891bc7023453a9c38e22de/docs/API.md"
anchor: "Balanced mode schedules synchronization about 150 ms after the first dirty change."
receipt: "commit:cc371426211fdcb250891bc7023453a9c38e22de"
```

```yaml:claim
id: MO-R29
axis: "memstick-opfs-bridge"
claim: "In opfs-vfs, file descriptor close alone does not flush the volume; file close and volume close are distinct operations, and success of a write is not proof of a completed checkpoint."
url: "https://raw.githubusercontent.com/opfs-vfs/opfs-vfs/cc371426211fdcb250891bc7023453a9c38e22de/docs/API.md"
anchor: "File descriptor close alone does not flush the volume."
receipt: "commit:cc371426211fdcb250891bc7023453a9c38e22de"
escalate: true
```

```yaml:claim
id: MO-R30
axis: "memstick-opfs-bridge"
claim: "opfs-vfs keeps a 30-second deadline for synchronous sync/fsync operations in its worker bridge, bounding the stall a synchronous save IPC may impose."
url: "https://github.com/opfs-vfs/opfs-vfs/commit/3d32b9e38066e9ebb34db3cfa15bb92f98ca3872"
anchor: "The deadline for synchronous sync and fsync stays at 30 seconds."
receipt: "commit:3d32b9e38066e9ebb34db3cfa15bb92f98ca3872"
```

```yaml:claim
id: MO-R31
axis: "memstick-opfs-bridge"
claim: "opfs-vfs requires a cross-origin isolated page for every worker client because it allocates a SharedArrayBuffer bridge, including for async-only use."
url: "https://raw.githubusercontent.com/opfs-vfs/opfs-vfs/cc371426211fdcb250891bc7023453a9c38e22de/docs/API.md"
anchor: "Every worker client needs a cross-origin isolated page because it allocates the SharedArrayBuffer bridge"
receipt: "commit:cc371426211fdcb250891bc7023453a9c38e22de"
```
```
