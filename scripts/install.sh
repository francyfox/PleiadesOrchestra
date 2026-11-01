#!/usr/bin/env bash
# One-command install of PleiadesOrchestra (orchestrator + admin API, no models) as a single
# container, Linux or macOS:
#   curl -fsSL https://raw.githubusercontent.com/francyfox/PleiadesOrchestra/master/scripts/install.sh | bash
# Models run elsewhere: pass their addresses and keys in the environment (LLM_BASE_URL, LLM_API_KEY,
# FUNCTION_CALL_BASE_URL, FUNCTION_CALL_API_KEY, LAYA_API_BASE_URL, LAYA_API_KEY, *_MODEL) or edit .env later.
# Env: PLEIADES_VERSION (image tag, default latest), PLEIADES_IMAGE (full image, overrides the version),
# PLEIADES_DIR (default ~/pleiades-orchestra: .env and data/). Rerunning pulls the new image and
# recreates the container; .env and data/ are kept.
set -euo pipefail

dir="${PLEIADES_DIR:-$HOME/pleiades-orchestra}"
image="${PLEIADES_IMAGE:-ghcr.io/francyfox/pleiades:${PLEIADES_VERSION:-latest}}"
say() { printf '\033[1m==> %s\033[0m\n' "$*"; }
die() { echo "error: $*" >&2; exit 1; }

case "$(uname -s)" in
	Linux*) os=linux ;;
	Darwin*) os=mac ;;
	*) die "unsupported OS: $(uname -s) (Linux and macOS only)" ;;
esac
command -v curl >/dev/null || die "curl is required"
sudo=""
[ "$(id -u)" -ne 0 ] && sudo="sudo"

if ! command -v docker >/dev/null; then
	say "installing Docker"
	if [ "$os" = linux ]; then
		# Official convenience script.
		curl -fsSL https://get.docker.com | $sudo sh
		[ -z "$sudo" ] || $sudo usermod -aG docker "$USER" || true
	else
		command -v brew >/dev/null || die "install Docker Desktop (https://docker.com) or Homebrew, then rerun"
		brew install --cask docker
		open -a Docker
	fi
fi

if [ "$os" = linux ]; then $sudo systemctl enable --now docker 2>/dev/null || true; fi
say "waiting for the Docker daemon"
d="docker"
for _ in $(seq 1 60); do
	if docker info >/dev/null 2>&1; then break; fi
	# Just added to the docker group: this shell has no access yet, use sudo.
	if [ "$os" = linux ] && $sudo docker info >/dev/null 2>&1; then d="$sudo docker"; break; fi
	sleep 2
done
$d info >/dev/null 2>&1 || die "Docker daemon is not running"

mkdir -p "$dir/data"
cd "$dir"
rand() { head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'; }

if [ ! -f .env ]; then
	say "generating $dir/.env with random keys"
	{
		echo "HARNESS_API_KEY=$(rand)"
		echo "ADMIN_API_KEY=$(rand)"
		echo "BETTER_AUTH_SECRET=$(rand)"
		echo "IP_HASH_SALT=$(rand)"
		# Keys of the model servers must match theirs: from the environment, else random.
		echo "LLM_API_KEY=${LLM_API_KEY:-$(rand)}"
		echo "FUNCTION_CALL_API_KEY=${FUNCTION_CALL_API_KEY:-$(rand)}"
		echo "LAYA_API_KEY=${LAYA_API_KEY:-$(rand)}"
		for k in LLM_BASE_URL LLM_MODEL FUNCTION_CALL_BASE_URL FUNCTION_CALL_MODEL LAYA_API_BASE_URL LAYA_MODEL; do
			[ -z "${!k:-}" ] || echo "$k=${!k}"
		done
	} > .env
	chmod 600 .env
fi
# The orchestrator will not start without these two addresses. Placeholders let it boot; they only
# seed providers.toml on the first start, point them at your models in the admin panel (Models).
for k in LLM_BASE_URL:http://127.0.0.1:8181/v1 LAYA_API_BASE_URL:http://127.0.0.1:8090; do
	grep -q "^${k%%:*}=." .env || { echo "${k%%:*}=${k#*:}" >> .env; placeholder=1; }
done
[ -z "${placeholder:-}" ] || echo "note: model addresses are placeholders; set the real ones in the admin panel (Models) or in $dir/.env" >&2

say "starting $image"
# A local image (PLEIADES_IMAGE) has nothing to pull.
$d pull -q "$image" >/dev/null || [ -n "${PLEIADES_IMAGE:-}" ] || die "cannot pull $image"
$d rm -f pleiades >/dev/null 2>&1 || true
# Loopback only: put a reverse proxy or tunnel in front for public access.
$d run -d --name pleiades --restart unless-stopped --env-file .env \
	-p 127.0.0.1:3000:3000 -p 127.0.0.1:3003:3003 -v "$dir/data:/data" "$image" >/dev/null

# `docker run -d` succeeds even if the app crashes at start: wait for the health endpoint.
for _ in $(seq 1 30); do curl -fs http://127.0.0.1:3000/health >/dev/null 2>&1 && break; sleep 1; done
curl -fs http://127.0.0.1:3000/health >/dev/null 2>&1 || { $d logs --tail 20 pleiades >&2; die "the container did not become healthy (is port 3000 free?)"; }

say "done: orchestrator on http://127.0.0.1:3000, admin API on :3003, files in $dir"
echo "Next: create the first admin with the albedo CLI (see the docs); logs: docker logs -f pleiades"
