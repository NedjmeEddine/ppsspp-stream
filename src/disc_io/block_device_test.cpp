#include "vfs_block_device.h"
#include "psp_header.h"
#include <cassert>
#include <cstring>
#include <iostream>
#include <vector>

#if !defined(__clang__) && !defined(_Atomic)
#define _Atomic
#endif
#ifndef _Static_assert
#define _Static_assert static_assert
#endif

extern "C" {
#include "externals/vfs-streamer/client/vfs/vfs_client.h"
#include "externals/vfs-streamer/client/vfs/vfs_fs.h"
#include "externals/vfs-streamer/client/vfs/vfs_policy.h"
}

class MockBlockDevice : public PspVfs::BlockDevice {
public:
    std::vector<uint8_t> data;
    explicit MockBlockDevice(size_t sz) : data(sz, 0) {}
    uint64_t GetDataSize() const override { return data.size(); }
    uint32_t GetNumBlocks() const override { return static_cast<uint32_t>(data.size() / PspVfs::UMD_SECTOR_SIZE); }
    uint64_t GetBlockSize() const override { return 262144ULL; }
    bool Read(uint64_t offset, uint64_t size, uint8_t* out) override {
        if (!out) return false;
        if (size == 0) return true;
        if (offset >= data.size() || size > data.size() - offset) return false;
        std::memcpy(out, data.data() + offset, size);
        return true;
    }
    bool ReadBlock(int32_t blockNumber, uint8_t* out) override {
        if (blockNumber < 0) return false;
        return ReadBlocks(static_cast<uint32_t>(blockNumber), 1, out);
    }
    bool ReadBlocks(uint32_t minBlock, uint32_t count, uint8_t* out) override {
        if (!out) return false;
        if (count == 0) return true;
        if (minBlock >= GetNumBlocks() || count > GetNumBlocks() - minBlock) return false;
        return Read(static_cast<uint64_t>(minBlock) * PspVfs::UMD_SECTOR_SIZE,
                    static_cast<uint64_t>(count) * PspVfs::UMD_SECTOR_SIZE, out);
    }
};

static void writePspPvd(uint8_t* base, const char* volTitle, const char* discId) {
    uint8_t* pvd = base + 0x8000;
    pvd[0] = 0x01;
    std::memcpy(pvd + 1, "CD001", 5);
    pvd[6] = 0x01;
    std::memset(pvd + 8, ' ', 64);
    std::memcpy(pvd + 8, "PSP GAME", 8);
    std::memcpy(pvd + 40, volTitle, std::strlen(volTitle));
    std::memcpy(pvd + 883, discId, std::strlen(discId));
}

int main() {
    std::cout << "[block_device_test] Starting PPSSPP VfsBlockDevice verification suite..." << std::endl;

    assert(PspVfs::VfsBlockDevice::Create(nullptr, "game.iso") == nullptr);

    const uint64_t dummySize = 1048576;
    PspVfs::VfsBlockDevice dev(nullptr, 1, dummySize);
    assert(dev.GetDataSize() == dummySize);
    assert(dev.GetNumBlocks() == dummySize / 2048);

    uint8_t buf[2048];
    assert(!dev.Read(0, 16, nullptr));
    assert(dev.Read(0, 0, buf));
    assert(!dev.Read(dummySize, 1, buf));
    assert(!dev.Read(dummySize - 10, 20, buf));
    assert(!dev.Read(0, 0x100000000ULL, buf));
    assert(!dev.ReadBlock(-1, buf));
    assert(!dev.ReadBlocks(dev.GetNumBlocks(), 1, buf));
    dev.HintCold(dummySize + 100, UINT64_MAX);

    // ISO9660 PSP header validation
    MockBlockDevice pspIso(131072);
    writePspPvd(pspIso.data.data(), "GOD OF WAR COO", "UCUS-98653");
    PspVfs::PspDiscHeader hdr;
    assert(PspVfs::ReadPspHeader(&pspIso, &hdr));
    assert(hdr.isPsp);
    assert(hdr.title == "GOD OF WAR COO");
    assert(hdr.discId == "UCUS-98653");

    // Non-PSP system identifier rejected
    std::memcpy(pspIso.data.data() + 0x8008, "PLAYSTATION ", 12);
    assert(!PspVfs::ReadPspHeader(&pspIso, &hdr));

    // Real VfsClientContext raw-ISO round-trip
    const uint32_t blockShift = 16;
    const uint32_t blockSize = 1u << blockShift;
    const uint32_t totalBlocks = 2;
    const uint64_t archiveSize = static_cast<uint64_t>(totalBlocks) * blockSize;
    const uint32_t poolMB = 16;
    const uint32_t totalFrames = ((poolMB * 1048576u / blockSize) / 8u) * 8u;
    std::vector<uint8_t> arena(VFS_ARENA_SLAB_OFFSET + totalFrames * blockSize + 64, 0);
    void* alignedArena = reinterpret_cast<void*>((reinterpret_cast<uintptr_t>(arena.data()) + 63u) & ~uintptr_t(63u));

    uint8_t mHdr[32] = {0};
    mHdr[0] = 0x56; mHdr[1] = 0x46; mHdr[2] = 0x53; mHdr[3] = 0x4D;
    mHdr[4] = 1; mHdr[6] = 1;
    for (int i = 0; i < 8; i++) mHdr[8 + i] = static_cast<uint8_t>((archiveSize >> (i * 8)) & 0xFF);
    mHdr[24] = totalBlocks; mHdr[28] = blockShift; mHdr[29] = 2; mHdr[31] = poolMB;

    VfsClientContext ctx{};
    assert(vfs_init_arena(&ctx, alignedArena, mHdr) == VFS_OK);

    uint32_t f0 = vfs_policy_set_index(0, ctx.ctrl->num_sets) * 8;
    ctx.dir[f0].block_id = 0;
    ctx.dir[f0].state = FRAME_READY;
    writePspPvd(ctx.slab + f0 * blockSize, "CRISIS CORE", "ULUS-10336");

    uint32_t f1 = vfs_policy_set_index(1, ctx.ctrl->num_sets) * 8;
    if (f1 == f0) f1++;
    ctx.dir[f1].block_id = 1;
    ctx.dir[f1].state = FRAME_READY;
    ctx.slab[f1 * blockSize] = 0x5A;

    VfsFs fs{};
    fs.ctx = &ctx;
    auto realDev = PspVfs::VfsBlockDevice::Create(&fs, "game.iso");
    assert(realDev != nullptr);
    assert(realDev->ReadBlock(16, buf));
    assert(buf[0] == 0x01 && std::memcmp(buf + 1, "CD001", 5) == 0);
    assert(PspVfs::ReadPspHeader(realDev.get(), &hdr));
    assert(hdr.discId == "ULUS-10336");

    realDev->HintCold(0, archiveSize + 4096);
    assert((ctx.dir[f0].flags & FLAG_COLD_HINT) == 0);
    assert((ctx.dir[f1].flags & FLAG_COLD_HINT) != 0);
    assert(vfs_client_ctx_size() == sizeof(VfsClientContext));
    assert(vfs_fs_struct_size() == sizeof(VfsFs));

    std::cout << "[block_device_test] All PPSSPP VfsBlockDevice assertions PASSED." << std::endl;
    return 0;
}
