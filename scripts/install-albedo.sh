#!/usr/bin/env bash
# Builds the albedo CLI binary for this machine (Linux, macOS, Windows Git Bash/MSYS)
# into the repo root and puts it on PATH, so `albedo admin:create ...` works anywhere.
# Usage: scripts/install-albedo.sh [bin-dir]   (default: ~/.local/bin)
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bin_dir="${1:-$HOME/.local/bin}"

case "$(uname -s)" in
	Linux*) os=linux ;;
	Darwin*) os=darwin ;;
	MINGW* | MSYS* | CYGWIN*) os=windows ;;
	*) echo "unsupported OS: $(uname -s)" >&2; exit 1 ;;
esac
case "$(uname -m)" in
	x86_64 | amd64) arch=x64 ;;
	arm64 | aarch64) arch=arm64 ;;
	*) echo "unsupported CPU: $(uname -m)" >&2; exit 1 ;;
esac
target="bun-$os-$arch"
# Alpine and other musl distros need the musl build.
if [ "$os" = linux ] && ldd --version 2>&1 | grep -qi musl; then target="$target-musl"; fi
ext=""
[ "$os" = windows ] && ext=".exe"

command -v bun >/dev/null || { echo "bun is required to build albedo: https://bun.sh" >&2; exit 1; }

out="$root/albedo$ext"
bun build "$root/apps/cli/src/index.ts" --compile --target="$target" --outfile "$out"

mkdir -p "$bin_dir"
if [ "$os" = windows ]; then
	# Symlinks on Windows need admin rights or developer mode: copy instead (rerun after a rebuild).
	cp "$out" "$bin_dir/albedo$ext"
else
	# A link, so a later `bun run build:albedo` updates the installed command too.
	ln -sf "$out" "$bin_dir/albedo"
fi
echo "installed: $bin_dir/albedo$ext ($target)"

case ":$PATH:" in
	*":$bin_dir:"*) ;;
	*) echo "note: $bin_dir is not on PATH; add it to your shell profile: export PATH=\"$bin_dir:\$PATH\"" ;;
esac
