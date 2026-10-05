#!/bin/sh
# Builds the native translator: SentencePiece + CTranslate2 from source, then
# `libtranslator.so` (translator.cpp, a flat C API that `bun:ffi` can call).
# Used by apps/alpha-orchestrator/Dockerfile (Alpine/musl) and by hand on a dev
# machine:   PREFIX=$PWD/.native ./native/build.sh
#
# CPU only: ruy for int8 matmuls, no MKL/CUDA, so the result is a few MB of
# libraries instead of a GPU stack.
set -eu

PREFIX="${PREFIX:-/opt/translator}"
# Half the cores by default: the machine stays usable while this compiles.
JOBS="${JOBS:-$(( $(nproc) / 2 > 0 ? $(nproc) / 2 : 1 ))}"
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="${WORK:-$(mktemp -d)}"
SPM_REF="${SPM_REF:-v0.2.0}"
CT2_REF="${CT2_REF:-v4.8.2}"

# GCC 15 no longer pulls <cstdint> in transitively; both projects relied on it.
# musl (Alpine) declares stat64/fstat64 only with _LARGEFILE64_SOURCE, and
# CTranslate2's bundled spdlog uses them.
FLAGS="-DCMAKE_POLICY_VERSION_MINIMUM=3.5 -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX=$PREFIX"
CXX_FLAGS="-include cstdint -D_LARGEFILE64_SOURCE"

mkdir -p "$PREFIX"

git clone --depth 1 --branch "$SPM_REF" https://github.com/google/sentencepiece.git "$WORK/spm"
cmake -S "$WORK/spm" -B "$WORK/spm/build" $FLAGS -DCMAKE_CXX_FLAGS="$CXX_FLAGS" \
  -DSPM_ENABLE_SHARED=ON -DSPM_BUILD_TEST=OFF
cmake --build "$WORK/spm/build" -j"$JOBS" --target install

git clone --depth 1 --branch "$CT2_REF" https://github.com/OpenNMT/CTranslate2.git "$WORK/ct2"
# Only the submodules a CPU build reads (not the CUDA ones: cutlass, thrust, cub).
git -C "$WORK/ct2" submodule update --init --depth 1 --recursive \
  third_party/cpu_features third_party/ruy third_party/spdlog
cmake -S "$WORK/ct2" -B "$WORK/ct2/build" $FLAGS -DCMAKE_CXX_FLAGS="$CXX_FLAGS" \
  -DBUILD_CLI=OFF -DBUILD_TESTS=OFF -DWITH_MKL=OFF -DWITH_DNNL=OFF -DWITH_RUY=ON \
  -DOPENMP_RUNTIME=COMP -DWITH_CUDA=OFF
cmake --build "$WORK/ct2/build" -j"$JOBS" --target install

g++ -std=c++17 -O2 -shared -fPIC -include cstdint -D_LARGEFILE64_SOURCE \
  -I"$PREFIX/include" -L"$PREFIX/lib" -L"$PREFIX/lib64" \
  "$HERE/translator.cpp" -o "$PREFIX/lib/libtranslator.so" \
  -lctranslate2 -lsentencepiece -fopenmp \
  -Wl,-rpath,'$ORIGIN'

echo "built: $PREFIX/lib/libtranslator.so"
