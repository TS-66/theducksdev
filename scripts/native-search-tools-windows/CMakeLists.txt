cmake_minimum_required(VERSION 3.21)

cmake_policy(SET CMP0091 NEW)
project(ducky_native_ugrep LANGUAGES C CXX)

if(NOT MSVC)
  message(FATAL_ERROR "Ducky Windows ugrep must be built with MSVC")
endif()

foreach(source_name UGREP PCRE2 ZLIB BZIP2 ZSTD BROTLI)
  if(NOT DEFINED DUCKY_${source_name}_SOURCE_DIR)
    message(FATAL_ERROR "Missing DUCKY_${source_name}_SOURCE_DIR")
  endif()
endforeach()

if(NOT DEFINED DUCKY_UGREP_OUTPUT_DIR)
  message(FATAL_ERROR "Missing DUCKY_UGREP_OUTPUT_DIR")
endif()

set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(BUILD_TESTING OFF CACHE BOOL "" FORCE)

# 随机构建目录不能进入最终 PE，否则同版本工具无法跨 CLI 复用同一份 runtime cache。
if(DEFINED DUCKY_BUILD_PATH)
  add_compile_options("/pathmap:${DUCKY_BUILD_PATH}=ducky-native-search")
endif()

set(BUILD_STATIC_LIBS ON CACHE BOOL "" FORCE)
set(PCRE2_BUILD_PCRE2_8 ON CACHE BOOL "" FORCE)
set(PCRE2_BUILD_PCRE2_16 OFF CACHE BOOL "" FORCE)
set(PCRE2_BUILD_PCRE2_32 OFF CACHE BOOL "" FORCE)
set(PCRE2_BUILD_PCRE2GREP OFF CACHE BOOL "" FORCE)
set(PCRE2_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(PCRE2_SHOW_REPORT OFF CACHE BOOL "" FORCE)
set(PCRE2_STATIC_RUNTIME ON CACHE BOOL "" FORCE)
set(PCRE2_SUPPORT_JIT ON CACHE BOOL "" FORCE)
add_subdirectory("${DUCKY_PCRE2_SOURCE_DIR}" pcre2 EXCLUDE_FROM_ALL)

set(SKIP_INSTALL_ALL ON CACHE BOOL "" FORCE)
add_subdirectory("${DUCKY_ZLIB_SOURCE_DIR}" zlib EXCLUDE_FROM_ALL)

add_library(ducky_bzip2 STATIC
  "${DUCKY_BZIP2_SOURCE_DIR}/blocksort.c"
  "${DUCKY_BZIP2_SOURCE_DIR}/huffman.c"
  "${DUCKY_BZIP2_SOURCE_DIR}/crctable.c"
  "${DUCKY_BZIP2_SOURCE_DIR}/randtable.c"
  "${DUCKY_BZIP2_SOURCE_DIR}/compress.c"
  "${DUCKY_BZIP2_SOURCE_DIR}/decompress.c"
  "${DUCKY_BZIP2_SOURCE_DIR}/bzlib.c"
)
target_compile_definitions(ducky_bzip2 PRIVATE _CRT_SECURE_NO_WARNINGS)
target_include_directories(ducky_bzip2 PUBLIC "${DUCKY_BZIP2_SOURCE_DIR}")

set(ZSTD_BUILD_CONTRIB OFF CACHE BOOL "" FORCE)
set(ZSTD_BUILD_PROGRAMS OFF CACHE BOOL "" FORCE)
set(ZSTD_BUILD_SHARED OFF CACHE BOOL "" FORCE)
set(ZSTD_BUILD_STATIC ON CACHE BOOL "" FORCE)
set(ZSTD_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(ZSTD_USE_STATIC_RUNTIME ON CACHE BOOL "" FORCE)
add_subdirectory("${DUCKY_ZSTD_SOURCE_DIR}/build/cmake" zstd EXCLUDE_FROM_ALL)

set(BROTLI_BUNDLED_MODE ON CACHE BOOL "" FORCE)
add_subdirectory("${DUCKY_BROTLI_SOURCE_DIR}" brotli EXCLUDE_FROM_ALL)

set(DUCKY_VIIZ_SOURCE_DIR "${DUCKY_UGREP_SOURCE_DIR}/lzma/C")
add_library(ducky_viiz STATIC
  "${DUCKY_VIIZ_SOURCE_DIR}/viizip.c"
  "${DUCKY_VIIZ_SOURCE_DIR}/7zAlloc.c"
  "${DUCKY_VIIZ_SOURCE_DIR}/7zArcIn.c"
  "${DUCKY_VIIZ_SOURCE_DIR}/7zBuf.c"
  "${DUCKY_VIIZ_SOURCE_DIR}/7zBuf2.c"
  "${DUCKY_VIIZ_SOURCE_DIR}/7zCrc.c"
  "${DUCKY_VIIZ_SOURCE_DIR}/7zCrcOpt.c"
  "${DUCKY_VIIZ_SOURCE_DIR}/7zDec.c"
  "${DUCKY_VIIZ_SOURCE_DIR}/7zFile.c"
  "${DUCKY_VIIZ_SOURCE_DIR}/7zStream.c"
  "${DUCKY_VIIZ_SOURCE_DIR}/Bcj2.c"
  "${DUCKY_VIIZ_SOURCE_DIR}/Bra.c"
  "${DUCKY_VIIZ_SOURCE_DIR}/Bra86.c"
  "${DUCKY_VIIZ_SOURCE_DIR}/BraIA64.c"
  "${DUCKY_VIIZ_SOURCE_DIR}/CpuArch.c"
  "${DUCKY_VIIZ_SOURCE_DIR}/Delta.c"
  "${DUCKY_VIIZ_SOURCE_DIR}/Lzma2Dec.c"
  "${DUCKY_VIIZ_SOURCE_DIR}/LzmaDec.c"
  "${DUCKY_VIIZ_SOURCE_DIR}/Ppmd7.c"
  "${DUCKY_VIIZ_SOURCE_DIR}/Ppmd7Dec.c"
)
target_compile_definitions(ducky_viiz PRIVATE
  Z7_PPMD_SUPPORT
  Z7_EXTRACT_ONLY
  NDEBUG
  _CRT_SECURE_NO_WARNINGS
)
target_include_directories(ducky_viiz PUBLIC "${DUCKY_VIIZ_SOURCE_DIR}")

set(DUCKY_REFLEX_SOURCES
  "${DUCKY_UGREP_SOURCE_DIR}/lib/block_scripts.cpp"
  "${DUCKY_UGREP_SOURCE_DIR}/lib/composer.cpp"
  "${DUCKY_UGREP_SOURCE_DIR}/lib/convert.cpp"
  "${DUCKY_UGREP_SOURCE_DIR}/lib/debug.cpp"
  "${DUCKY_UGREP_SOURCE_DIR}/lib/error.cpp"
  "${DUCKY_UGREP_SOURCE_DIR}/lib/input.cpp"
  "${DUCKY_UGREP_SOURCE_DIR}/lib/language_scripts.cpp"
  "${DUCKY_UGREP_SOURCE_DIR}/lib/letter_case.cpp"
  "${DUCKY_UGREP_SOURCE_DIR}/lib/letter_scripts.cpp"
  "${DUCKY_UGREP_SOURCE_DIR}/lib/matcher.cpp"
  "${DUCKY_UGREP_SOURCE_DIR}/lib/pattern.cpp"
  "${DUCKY_UGREP_SOURCE_DIR}/lib/posix.cpp"
  "${DUCKY_UGREP_SOURCE_DIR}/lib/simd.cpp"
  "${DUCKY_UGREP_SOURCE_DIR}/lib/unicode.cpp"
  "${DUCKY_UGREP_SOURCE_DIR}/lib/utf8.cpp"
)

add_library(ducky_reflex STATIC ${DUCKY_REFLEX_SOURCES})
target_compile_definitions(ducky_reflex PRIVATE WITH_NO_CODEGEN)

add_executable(ugrep
  "${DUCKY_UGREP_SOURCE_DIR}/src/ugrep.cpp"
  "${DUCKY_UGREP_SOURCE_DIR}/src/cnf.cpp"
  "${DUCKY_UGREP_SOURCE_DIR}/src/glob.cpp"
  "${DUCKY_UGREP_SOURCE_DIR}/src/output.cpp"
  "${DUCKY_UGREP_SOURCE_DIR}/src/query.cpp"
  "${DUCKY_UGREP_SOURCE_DIR}/src/screen.cpp"
  "${DUCKY_UGREP_SOURCE_DIR}/src/stats.cpp"
  "${DUCKY_UGREP_SOURCE_DIR}/src/vkey.cpp"
  "${DUCKY_UGREP_SOURCE_DIR}/src/zopen.c"
)

add_library(ducky_ugrep_contract INTERFACE)
target_compile_definitions(ducky_ugrep_contract INTERFACE
  HAVE_LIBBROTLI
  HAVE_LIBBZ2
  HAVE_LIBZ
  HAVE_LIBZSTD
  HAVE_PCRE2
  NDEBUG
  PCRE2_STATIC
  WITH_COLOR
  WITH_NO_INDENT
  _CONSOLE
  _CRT_NONSTDC_NO_WARNINGS
  _CRT_SECURE_NO_WARNINGS
)
if(CMAKE_GENERATOR_PLATFORM STREQUAL "ARM64")
  target_compile_definitions(ducky_ugrep_contract INTERFACE HAVE_NEON)
else()
  target_compile_definitions(ducky_ugrep_contract INTERFACE HAVE_SSE2)
endif()
target_compile_features(ducky_ugrep_contract INTERFACE cxx_std_17)
# ugrep 固定源码是无 BOM UTF-8；中文 Windows 按 CP936 解析时会触发 C4819/C1070，并改写 UTF-8 字符串字面量。
target_compile_options(ducky_ugrep_contract INTERFACE
  /utf-8
  $<$<COMPILE_LANGUAGE:CXX>:/EHsc>
)
target_include_directories(ducky_ugrep_contract INTERFACE
  "${DUCKY_UGREP_SOURCE_DIR}/include"
  "${DUCKY_UGREP_SOURCE_DIR}/src"
  "${DUCKY_VIIZ_SOURCE_DIR}"
)

target_link_libraries(ducky_reflex PRIVATE ducky_ugrep_contract pcre2-8-static)
target_link_libraries(ugrep PRIVATE
  ducky_ugrep_contract
  ducky_reflex
  ducky_viiz
  pcre2-8-static
  zlibstatic
  ducky_bzip2
  libzstd_static
  brotlienc
  brotlidec
  brotlicommon
)
target_link_options(ugrep PRIVATE /Brepro)
set_target_properties(ugrep PROPERTIES
  RUNTIME_OUTPUT_DIRECTORY "${DUCKY_UGREP_OUTPUT_DIR}"
  RUNTIME_OUTPUT_DIRECTORY_RELEASE "${DUCKY_UGREP_OUTPUT_DIR}"
)
