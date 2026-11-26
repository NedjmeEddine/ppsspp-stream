#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="${ROOT_DIR}/build/ppsspp-src"
OUT_DIR="${ROOT_DIR}/cores/ppsspp"
PATCH_DIR="${OUT_DIR}/patches"

PPSSPP_REPO="${PPSSPP_REPO:-https://github.com/root-hunter/ppsspp-wasm.git}"
PPSSPP_COMMIT="${PPSSPP_COMMIT:-4d0564bc687b86d2f88e132d79ea118e290b004b}"
REQUIRED_EMSDK_VERSION="6.0.12"

USE_FFMPEG="${USE_FFMPEG:-OFF}"
WASM_MALLOC="${WASM_MALLOC:-emmalloc}"
WASM_BUILD_TYPE="${WASM_BUILD_TYPE:-Release}"
WASM_MAX_PERF="${WASM_MAX_PERF:-ON}"
WASM_MAIN_LOOP_FPS="${WASM_MAIN_LOOP_FPS:-60}"
WASM_JOBS="${WASM_JOBS:-3}"
CMAKE_BIN="${CMAKE:-$(command -v cmake || echo /home/nedjmo/.local/bin/cmake)}"

if ! command -v emcc >/dev/null 2>&1; then
    echo "ERROR: emcc not found on PATH. Run: source ~/.local/share/emsdk/emsdk_env.sh" >&2
    exit 1
fi

EMCC_VER="$(emcc --version | head -n 1)"
if [[ "${EMCC_VER}" != *"${REQUIRED_EMSDK_VERSION}"* ]]; then
    echo "ERROR: Expected Emscripten ${REQUIRED_EMSDK_VERSION}, got: ${EMCC_VER}" >&2
    exit 1
fi

if [[ ! -x "${CMAKE_BIN}" ]]; then
    echo "ERROR: cmake not found (${CMAKE_BIN})" >&2
    exit 1
fi

REQUIRED_SUBMODULES=(
    assets/debugger
    ext/OpenXR-SDK
    ext/SPIRV-Cross
    ext/aemu_postoffice
    ext/armips
    ext/cpu_features
    ext/freetype
    ext/glslang
    ext/libchdr
    ext/lua
    ext/miniupnp
    ext/naett
    ext/nanosvg
    ext/rapidjson
    ext/rcheevos
    ext/zstd
)

if [[ ! -d "${SRC_DIR}/.git" ]]; then
    mkdir -p "$(dirname "${SRC_DIR}")"
    echo "[build_ppsspp_core] Cloning ${PPSSPP_REPO} @ ${PPSSPP_COMMIT} into ${SRC_DIR}..."
    git clone --depth 1 --branch wasm "${PPSSPP_REPO}" "${SRC_DIR}"
    git -C "${SRC_DIR}" fetch --depth 1 origin "${PPSSPP_COMMIT}" || true
    git -C "${SRC_DIR}" checkout "${PPSSPP_COMMIT}"
    git -C "${SRC_DIR}" submodule update --init --depth 1 --jobs 6 "${REQUIRED_SUBMODULES[@]}"
    git -C "${SRC_DIR}/ext/armips" submodule update --init --recursive --depth 1
fi

echo "[build_ppsspp_core] Resetting ${SRC_DIR} and applying patches..."
git -C "${SRC_DIR}" reset --hard "${PPSSPP_COMMIT}"
git -C "${SRC_DIR}" clean -fd -e "build-wasm*"

shopt -s nullglob
PATCHES=("${PATCH_DIR}"/*.patch)
shopt -u nullglob
if [[ ${#PATCHES[@]} -eq 0 ]]; then
    echo "ERROR: No patches found in ${PATCH_DIR}" >&2
    exit 1
fi
for p in "${PATCHES[@]}"; do
    echo "[build_ppsspp_core] Applying $(basename "${p}")..."
    git -C "${SRC_DIR}" apply --whitespace=nowarn "${p}"
done

BUILD_SUBDIR="build-wasm-release"
if [[ "${WASM_BUILD_TYPE}" != "Release" ]]; then
    BUILD_SUBDIR="build-wasm"
fi

echo "[build_ppsspp_core] Configuring (${WASM_BUILD_TYPE}, FFmpeg=${USE_FFMPEG}, malloc=${WASM_MALLOC}, jobs=${WASM_JOBS})..."
(
    cd "${SRC_DIR}"
    emcmake "${CMAKE_BIN}" -S . -B "${BUILD_SUBDIR}" -G Ninja \
        -DUSING_GLES2=ON \
        -DUSING_EGL=OFF \
        -DVULKAN=OFF \
        -DUSE_NO_MMAP=ON \
        -DUSE_FFMPEG="${USE_FFMPEG}" \
        -DUSE_DISCORD=OFF \
        -DUSE_MINIUPNPC=OFF \
        -DUSE_SYSTEM_LIBSDL2=OFF \
        -DUSE_SYSTEM_LIBPNG=OFF \
        -DUSE_SYSTEM_FREETYPE=OFF \
        -DUSE_SYSTEM_LIBZIP=OFF \
        -DWASM_MAIN_LOOP_FPS="${WASM_MAIN_LOOP_FPS}" \
        -DWASM_INITIAL_MEMORY=536870912 \
        -DWASM_MAXIMUM_MEMORY=536870912 \
        -DCMAKE_BUILD_TYPE="${WASM_BUILD_TYPE}" \
        -DWASM_MAX_PERF="${WASM_MAX_PERF}" \
        -DWASM_ENABLE_LTO=OFF \
        -DWASM_MALLOC="${WASM_MALLOC}" \
        -DPPSSPP_STREAM_INTEGRATION=ON

    echo "[build_ppsspp_core] Building PPSSPPSDL..."
    "${CMAKE_BIN}" --build "${BUILD_SUBDIR}" -j"${WASM_JOBS}"
)

mkdir -p "${OUT_DIR}"
for f in PPSSPPSDL.js PPSSPPSDL.wasm PPSSPPSDL.data PPSSPPSDL.worker.js; do
    if [[ -f "${SRC_DIR}/${BUILD_SUBDIR}/${f}" ]]; then
        cp -f "${SRC_DIR}/${BUILD_SUBDIR}/${f}" "${OUT_DIR}/${f}"
        echo "[build_ppsspp_core] Installed cores/ppsspp/${f} ($(du -h "${OUT_DIR}/${f}" | cut -f1))"
    fi
done
