#include "psp_header.h"
#include "vfs_block_device.h"
#include <array>
#include <cstring>
#include <cstdio>

namespace PspVfs {

static std::string trimAscii(const uint8_t* buf, size_t len) {
    size_t end = len;
    while (end > 0 && (buf[end - 1] == ' ' || buf[end - 1] == '\0')) {
        --end;
    }
    size_t start = 0;
    while (start < end && (buf[start] == ' ' || buf[start] == '\0')) {
        ++start;
    }
    return std::string(reinterpret_cast<const char*>(buf + start), end - start);
}

bool ReadPspHeader(BlockDevice* dev, PspDiscHeader* out) {
    if (!dev || !out) return false;
    out->isPsp = false;
    out->discId.clear();
    out->title.clear();

    std::array<uint8_t, UMD_SECTOR_SIZE> pvd{};
    if (!dev->Read(0x8000ULL, pvd.size(), pvd.data())) {
        return false;
    }

    // ISO9660 Primary Volume Descriptor: type 0x01, standard identifier "CD001", version 0x01
    if (pvd[0] != 0x01 || std::memcmp(pvd.data() + 1, "CD001", 5) != 0 || pvd[6] != 0x01) {
        return false;
    }

    // PSP UMDs store "PSP GAME" in System Identifier (offset 8..39)
    std::string sysId = trimAscii(pvd.data() + 8, 32);
    if (sysId != "PSP GAME") {
        return false;
    }

    out->isPsp = true;
    out->title = trimAscii(pvd.data() + 40, 32);     // Volume Identifier
    std::string appData = trimAscii(pvd.data() + 883, 16); // Optional UMD Disc ID in Application Use
    out->discId = !appData.empty() ? appData : out->title;
    return true;
}

} // namespace PspVfs

extern "C" {

int32_t vfs_block_identify(VfsBlockDeviceOpaque* dev, char* out_id, size_t id_cap, char* out_title, size_t title_cap) {
    if (!dev) return 0;
    auto* d = reinterpret_cast<PspVfs::VfsBlockDevice*>(dev);
    PspVfs::PspDiscHeader hdr;
    if (!PspVfs::ReadPspHeader(d, &hdr)) {
        return 0;
    }
    if (out_id && id_cap > 0) {
        snprintf(out_id, id_cap, "%s", hdr.discId.c_str());
    }
    if (out_title && title_cap > 0) {
        snprintf(out_title, title_cap, "%s", hdr.title.c_str());
    }
    return 1;
}

} // extern "C"
