CC ?= gcc
CXX ?= g++
EMCC ?= emcc
EMCXX ?= em++

BUILD_DIR = build
VFS_DIR = externals/vfs-streamer/client/vfs
CFLAGS = -std=c11 -O2 -Wall -Wextra -pthread -I. -Iexternals/vfs-streamer -I$(VFS_DIR)
CXXFLAGS = -std=c++20 -O2 -Wall -Wextra -pthread -I. -Iexternals/vfs-streamer -I$(VFS_DIR)

VFS_OBJS = $(BUILD_DIR)/vfs_client.o $(BUILD_DIR)/vfs_fs.o $(BUILD_DIR)/vfs_hal.o $(BUILD_DIR)/vfs_policy.o
DISC_IO_OBJS = $(BUILD_DIR)/vfs_block_device.o $(BUILD_DIR)/psp_header.o

all: libppsspp_vfs.a block_device_test

libppsspp_vfs.a: $(DISC_IO_OBJS) $(VFS_OBJS)
	ar rcs $@ $^

block_device_test: src/disc_io/block_device_test.cpp $(DISC_IO_OBJS) $(VFS_OBJS)
	$(CXX) $(CXXFLAGS) -DVFS_TESTING $^ -o $@

$(BUILD_DIR)/vfs_block_device.o: src/disc_io/vfs_block_device.cpp | $(BUILD_DIR)
	$(CXX) $(CXXFLAGS) -c $< -o $@

$(BUILD_DIR)/psp_header.o: src/disc_io/psp_header.cpp | $(BUILD_DIR)
	$(CXX) $(CXXFLAGS) -c $< -o $@

$(BUILD_DIR)/%.o: $(VFS_DIR)/%.c | $(BUILD_DIR)
	$(CC) $(CFLAGS) -c $< -o $@

$(BUILD_DIR):
	mkdir -p $(BUILD_DIR)

test: block_device_test
	./block_device_test

wasm:
	mkdir -p $(BUILD_DIR)/embuild
	$(EMCC) -std=c11 -O2 -pthread -I. -I$(VFS_DIR) -Isrc -Isrc/disc_io -c $(VFS_DIR)/vfs_client.c -o $(BUILD_DIR)/embuild/vfs_client.o
	$(EMCC) -std=c11 -O2 -pthread -I. -I$(VFS_DIR) -Isrc -Isrc/disc_io -c $(VFS_DIR)/vfs_hal.c -o $(BUILD_DIR)/embuild/vfs_hal.o
	$(EMCC) -std=c11 -O2 -pthread -I. -I$(VFS_DIR) -Isrc -Isrc/disc_io -c $(VFS_DIR)/vfs_policy.c -o $(BUILD_DIR)/embuild/vfs_policy.o
	$(EMCC) -std=c11 -O2 -pthread -I. -I$(VFS_DIR) -Isrc -Isrc/disc_io -c $(VFS_DIR)/vfs_fs.c -o $(BUILD_DIR)/embuild/vfs_fs.o
	$(EMCXX) -std=c++20 -O2 -pthread -I. -I$(VFS_DIR) -Isrc -Isrc/disc_io -c src/disc_io/vfs_block_device.cpp -o $(BUILD_DIR)/embuild/vfs_block_device.o
	$(EMCXX) -std=c++20 -O2 -pthread -I. -I$(VFS_DIR) -Isrc -Isrc/disc_io -c src/disc_io/psp_header.cpp -o $(BUILD_DIR)/embuild/psp_header.o
	$(EMCXX) -O2 -pthread \
	  -sIMPORTED_MEMORY=1 -sINITIAL_MEMORY=67108864 -sMAXIMUM_MEMORY=536870912 -sALLOW_MEMORY_GROWTH=0 \
	  -sWASM_BIGINT \
	  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createVfsModule \
	  -sEXPORTED_FUNCTIONS='["_vfs_init_arena","_vfs_attach_arena","_vfs_read_sync","_vfs_hint_cold","_vfs_fs_mount","_vfs_fs_unmount","_vfs_fs_stat","_vfs_fs_open","_vfs_fs_read","_vfs_fs_pread","_vfs_fs_seek","_vfs_fs_tell","_vfs_fs_close","_vfs_fs_hint_cold","_vfs_block_open","_vfs_block_read","_vfs_block_read_sectors","_vfs_block_size","_vfs_block_num_sectors","_vfs_block_close","_vfs_block_identify","_vfs_client_ctx_size","_vfs_fs_struct_size","_aligned_alloc","_malloc","_free"]' \
	  $(BUILD_DIR)/embuild/*.o \
	  -o web/vfs.js

server:
	mkdir -p bin
	go build -o bin/ppsspp-server ./cmd/ppsspp-server
	cd externals/vfs-streamer && go build -o ../../bin/markov-pack ./cmd/markov-pack

ppsspp-core:
	./scripts/build_ppsspp_core.sh

clean:
	rm -rf $(BUILD_DIR) libppsspp_vfs.a block_device_test src/disc_io/*.o *.o

.PHONY: all clean test wasm server ppsspp-core
