#!/usr/bin/env bash
set -euo pipefail

repo="$GITHUB_WORKSPACE"
proof="$repo/.native-proof"
mkdir -p "$proof"
{
  date -u
  sw_vers
  uname -a
  sysctl hw.memsize hw.ncpu
  df -h
  xcodebuild -version
  xcrun --show-sdk-path
  node --version
  bun --version
  python3 --version
  brew --version
} | tee "$proof/preflight.log"

python3 "$repo/.github/native-bun-validation/prepare.py" \
  --bun "$repo/.native-bun" --out "$proof" | tee "$proof/source-verification.json"

# CONTRIBUTING.md's macOS prerequisites, plus its required LLVM major.
brew update
brew install automake ccache cmake coreutils gnu-sed go icu4c libiconv libtool ninja pkg-config rustup-init ruby llvm
export PATH="$(brew --prefix llvm)/bin:$(brew --prefix rustup-init)/bin:$HOME/.cargo/bin:$PATH"
export RUSTUP_TOOLCHAIN=nightly-2026-09-15
export CARGO_BUILD_JOBS=1
export CARGO_INCREMENTAL=0
if ! command -v rustup >/dev/null; then
  rustup-init -y --no-modify-path --profile minimal --default-toolchain none
fi
rustup toolchain install "$RUSTUP_TOOLCHAIN" --profile minimal --component rust-src
llvm_version="$(llvm-config --version)"
[[ "$llvm_version" =~ ^23\.1\.[0-9]+$ ]] || { echo "Expected LLVM 23.1.x, got $llvm_version"; exit 1; }
{
  brew list --versions
  clang --version
  llvm-config --version
  rustc -vV
  cargo --version
  rustup show
  cmake --version
  ninja --version
  ccache --version
  df -h
} | tee "$proof/toolchain.log"

cd "$repo/.native-bun"
bun install --frozen-lockfile 2>&1 | tee "$proof/root-install.log"
bun install --cwd test --frozen-lockfile 2>&1 | tee "$proof/test-install.log"

# Use the official build-and-execute path. No timeout wraps compilation.
read -r -a native_tests <<< "$(python3 -c 'import json; from pathlib import Path; m=json.loads(Path("../.github/native-bun-validation/native-v9-manifest.json").read_text()); print(m["testCommand"].split(" test ", 1)[1])')"
[[ "${#native_tests[@]}" -eq 9 ]]
bun run build:assert -j1 test "${native_tests[@]}" 2>&1 | tee "$proof/native-tests.log"
