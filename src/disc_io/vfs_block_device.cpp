#include "vfs_block_device.h"

#if !defined(__clang__) && !defined(_Atomic)
#define _Atomic
#endif
#ifndef _Static_assert
#define _Static_assert static_assert
#endif

extern "C" {
#include "externals/vfs-streamer/client/vfs/vfs_client.h"
#include "externals/vfs-streamer/client/vfs/vfs_fs.h"
}

namespace PspVfs {

std::unique_ptr<VfsBlockDevice> VfsBlockDevice::Create(VfsFs* fs, const std::string& path) {
    if (!fs) return nullptr;

    uint64_t size = 0;
    int32_t statRc = vfs_fs_stat(fs, path.c_str(), &size);
    if (statRc == VFS_FS_OK) {
        uint32_t fd = 0;
        int32_t openRc = vfs_fs_open(fs, path.c_str(), &fd);
        if (openRc == VFS_FS_OK) {
            return std::make_unique<VfsBlockDevice>(fs, fd, size);
        }
        return nullptr;
    }

    // shortcut: Fallback for raw ISO streams where TOC is absent (fs unmounted or raw ISO pack),
    // upgrade when all UMDs are packaged in VFSI directory packs.
    if (statRc == VFS_FS_ERR_NOT_MOUNTED && fs->ctx) {
        uint64_t archiveSize = vfs_archive_byte_size(fs->ctx);
        if (archiveSize > 0) {
            return std::make_unique<VfsBlockDevice>(fs, 0, archiveSize);
        }
    }

    return nullptr;
}

VfsBlockDevice::VfsBlockDevice(VfsFs* fs, uint32_t fd, uint64_t discSize)
    : m_fs(fs), m_fd(fd), m_size(discSize) {
}

VfsBlockDevice::~VfsBlockDevice() {
    if (m_fs && m_fd) {
        vfs_fs_close(m_fs, m_fd);
        m_fd = 0;
    }
}

uint64_t VfsBlockDevice::GetBlockSize() const {
    if (!m_fs || !m_fs->ctx) return 262144ULL;
    return 1ULL << vfs_block_shift(m_fs->ctx);
}

bool VfsBlockDevice::Read(uint64_t offset, uint64_t size, uint8_t* out_ptr) {
    if (!out_ptr) return false;
    if (size == 0) return true;
    if (offset >= m_size || size > m_size - offset) return false;

    uint64_t done = 0;
    while (done < size) {
        uint64_t remain = size - done;
        size_t chunk = (remain > VFS_FS_READ_SLICE_MAX)
                           ? static_cast<size_t>(VFS_FS_READ_SLICE_MAX)
                           : static_cast<size_t>(remain);
        if (m_fd != 0) {
            int64_t bytesRead = vfs_fs_pread(m_fs, m_fd, offset + done, out_ptr + done, chunk);
            if (bytesRead != static_cast<int64_t>(chunk)) return false;
        } else if (m_fs && m_fs->ctx) {
            ptrdiff_t bytesRead = vfs_read_sync(m_fs->ctx, offset + done, out_ptr + done, chunk);
            if (bytesRead != static_cast<ptrdiff_t>(chunk)) return false;
        } else {
            return false;
        }
        done += chunk;
    }
    return true;
}

bool VfsBlockDevice::ReadBlock(int32_t blockNumber, uint8_t* out_ptr) {
    if (blockNumber < 0) return false;
    return ReadBlocks(static_cast<uint32_t>(blockNumber), 1, out_ptr);
}

bool VfsBlockDevice::ReadBlocks(uint32_t minBlock, uint32_t count, uint8_t* out_ptr) {
    if (!out_ptr) return false;
    if (count == 0) return true;
    uint32_t totalBlocks = GetNumBlocks();
    if (minBlock >= totalBlocks || count > totalBlocks - minBlock) return false;
    uint64_t offset = static_cast<uint64_t>(minBlock) * UMD_SECTOR_SIZE;
    uint64_t size = static_cast<uint64_t>(count) * UMD_SECTOR_SIZE;
    return Read(offset, size, out_ptr);
}

void VfsBlockDevice::HintCold(uint64_t offset, uint64_t size) {
    if (!m_fs || size == 0 || offset >= m_size) return;
    uint64_t avail = m_size - offset;
    if (size > avail) size = avail;

    if (m_fd != 0) {
        vfs_fs_hint_cold(m_fs, m_fd, offset, size, VFS_FS_HINT_INTERIOR_ONLY);
    } else if (m_fs->ctx) {
        uint32_t shift = vfs_block_shift(m_fs->ctx);
        uint64_t first_block = offset >> shift;
        uint64_t last_block = (offset + size - 1) >> shift;
        if (first_block == 0) first_block = 1; // Keep ISO9660 PVD & boot header hot
        for (uint64_t b = first_block; b <= last_block && b <= UINT32_MAX; ++b) {
            vfs_hint_cold(m_fs->ctx, static_cast<uint32_t>(b));
        }
    }
}

} // namespace PspVfs

extern "C" {

VfsBlockDeviceOpaque* vfs_block_open(struct VfsFs* fs, const char* path) {
    if (!fs || !path) return nullptr;
    auto dev = PspVfs::VfsBlockDevice::Create(fs, path);
    return reinterpret_cast<VfsBlockDeviceOpaque*>(dev.release());
}

int32_t vfs_block_read(VfsBlockDeviceOpaque* dev, uint64_t offset, uint64_t size, uint8_t* out_ptr) {
    if (!dev) return 0;
    return reinterpret_cast<PspVfs::VfsBlockDevice*>(dev)->Read(offset, size, out_ptr) ? 1 : 0;
}

int32_t vfs_block_read_sectors(VfsBlockDeviceOpaque* dev, uint32_t min_sector, uint32_t count, uint8_t* out_ptr) {
    if (!dev) return 0;
    return reinterpret_cast<PspVfs::VfsBlockDevice*>(dev)->ReadBlocks(min_sector, count, out_ptr) ? 1 : 0;
}

uint64_t vfs_block_size(const VfsBlockDeviceOpaque* dev) {
    if (!dev) return 0;
    return reinterpret_cast<const PspVfs::VfsBlockDevice*>(dev)->GetDataSize();
}

uint32_t vfs_block_num_sectors(const VfsBlockDeviceOpaque* dev) {
    if (!dev) return 0;
    return reinterpret_cast<const PspVfs::VfsBlockDevice*>(dev)->GetNumBlocks();
}

void vfs_block_hint_cold(VfsBlockDeviceOpaque* dev, uint64_t offset, uint64_t size) {
    if (!dev) return;
    reinterpret_cast<PspVfs::VfsBlockDevice*>(dev)->HintCold(offset, size);
}

void vfs_block_close(VfsBlockDeviceOpaque* dev) {
    if (!dev) return;
    delete reinterpret_cast<PspVfs::VfsBlockDevice*>(dev);
}

size_t vfs_client_ctx_size(void) {
    return sizeof(VfsClientContext);
}

size_t vfs_fs_struct_size(void) {
    return sizeof(VfsFs);
}

} // extern "C"
