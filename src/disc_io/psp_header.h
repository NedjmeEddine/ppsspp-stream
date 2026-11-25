#ifndef PSP_HEADER_H
#define PSP_HEADER_H

#include <cstdint>
#include <cstddef>
#include <string>

namespace PspVfs {

class BlockDevice;

struct PspDiscHeader {
    bool        isPsp = false;
    std::string discId;    // e.g. "ULUS-10041" or volume label
    std::string title;     // Volume / game title
};

// Reads ISO9660 Primary Volume Descriptor at sector 16 (0x8000) and validates PSP UMD signature.
bool ReadPspHeader(BlockDevice* dev, PspDiscHeader* out);

} // namespace PspVfs

#ifdef __cplusplus
extern "C" {
#endif

typedef struct VfsBlockDeviceOpaque VfsBlockDeviceOpaque;

// Returns 1 if valid PSP UMD ISO9660 image, 0 otherwise.
int32_t vfs_block_identify(VfsBlockDeviceOpaque* dev, char* out_id, size_t id_cap, char* out_title, size_t title_cap);

#ifdef __cplusplus
}
#endif

#endif // PSP_HEADER_H
