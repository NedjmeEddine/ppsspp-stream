#ifndef VFS_BLOCK_DEVICE_H
#define VFS_BLOCK_DEVICE_H

#include <cstdint>
#include <cstddef>
#include <memory>
#include <string>

struct VfsFs;

namespace PspVfs {

constexpr uint64_t UMD_SECTOR_SIZE = 2048ULL;

class BlockDevice {
public:
    virtual ~BlockDevice() = default;
    virtual uint64_t GetDataSize() const = 0;
    virtual uint32_t GetNumBlocks() const = 0;
    virtual uint64_t GetBlockSize() const = 0;
    virtual bool Read(uint64_t offset, uint64_t size, uint8_t* out_ptr) = 0;
    virtual bool ReadBlock(int32_t blockNumber, uint8_t* out_ptr) = 0;
    virtual bool ReadBlocks(uint32_t minBlock, uint32_t count, uint8_t* out_ptr) = 0;
};

class VfsBlockDevice : public BlockDevice {
public:
    static std::unique_ptr<VfsBlockDevice> Create(VfsFs* fs, const std::string& path);

    VfsBlockDevice(VfsFs* fs, uint32_t fd, uint64_t discSize);
    ~VfsBlockDevice() override;

    uint64_t GetDataSize() const override { return m_size; }
    uint32_t GetNumBlocks() const override { return static_cast<uint32_t>(m_size / UMD_SECTOR_SIZE); }
    uint64_t GetBlockSize() const override;

    bool Read(uint64_t offset, uint64_t size, uint8_t* out_ptr) override;
    bool ReadBlock(int32_t blockNumber, uint8_t* out_ptr) override;
    bool ReadBlocks(uint32_t minBlock, uint32_t count, uint8_t* out_ptr) override;

    void HintCold(uint64_t offset, uint64_t size);
    uint32_t GetFd() const { return m_fd; }

private:
    VfsFs*   m_fs;
    uint32_t m_fd;
    uint64_t m_size;
};

} // namespace PspVfs

#ifdef __cplusplus
extern "C" {
#endif

typedef struct VfsBlockDeviceOpaque VfsBlockDeviceOpaque;

VfsBlockDeviceOpaque* vfs_block_open(struct VfsFs* fs, const char* path);
int32_t vfs_block_read(VfsBlockDeviceOpaque* dev, uint64_t offset, uint64_t size, uint8_t* out_ptr);
int32_t vfs_block_read_sectors(VfsBlockDeviceOpaque* dev, uint32_t min_sector, uint32_t count, uint8_t* out_ptr);
uint64_t vfs_block_size(const VfsBlockDeviceOpaque* dev);
uint32_t vfs_block_num_sectors(const VfsBlockDeviceOpaque* dev);
void vfs_block_hint_cold(VfsBlockDeviceOpaque* dev, uint64_t offset, uint64_t size);
void vfs_block_close(VfsBlockDeviceOpaque* dev);
size_t vfs_client_ctx_size(void);
size_t vfs_fs_struct_size(void);

#ifdef __cplusplus
}
#endif

#endif // VFS_BLOCK_DEVICE_H
