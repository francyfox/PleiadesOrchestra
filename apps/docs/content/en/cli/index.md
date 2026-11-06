---
title: CLI
---

# CLI (`albedo`)

`albedo` is a small command-line client for the orchestrator: send a message, reset a thread, create a staff account, run the quality evals. It has no logic of its own: it calls the [Server API](/docs/api/server/) (and Docker for the admin helpers).

## Where to get it

- **In the image:** `albedo` is built into `ghcr.io/francyfox/pleiades`, so on a server you run it in the container: `docker exec pleiades albedo help`. `HARNESS_BASE_URL` is already set there and `HARNESS_API_KEY` comes from the container's `.env`.
- **A ready binary:** every [GitHub release](https://github.com/francyfox/PleiadesOrchestra/releases) has `albedo` for Linux (`x64` and `arm64`, and `-musl` builds for Alpine) and macOS (`darwin-x64`, `darwin-arm64`) with a checksums file. Download the one for your system, `chmod +x` it and put it on your `PATH`.
- **From a checkout:** `scripts/install-albedo.sh` builds a single binary with Bun and links it into `~/.local/bin`; or run it from source with `bun --cwd apps/cli start <command>`.

## Environment

| Variable | Meaning |
| --- | --- |
| `HARNESS_API_KEY` | The transport key of the orchestrator. Required for `send` and `reset`. |
| `HARNESS_BASE_URL` | Orchestrator address. Default `http://localhost:3000`. |
| `PLEIADES_VERSION` | The stack version `albedo --version` prints; without it the version built into the CLI. |

## Commands

Every command has a short form.

| Command | Short | What it does |
| --- | --- | --- |
| `send` | `s` | Sends a message (`-m`) and streams the reply; `-t` thread, `-u` user. `-a alpha\|beta\|delta` asks one agent's model alone, `-a gamma -q "question"` asks the decision agent (`--options a,b,c` for a choice). |
| `reset` | `r` | Clears a thread's history (`-t`). |
| `admin:create` | `ac` | Creates a staff account, or a new token for an existing one (`--email`, `--name`, `--level 0\|100`). The token is printed once. It finds the admin API by itself: the `pleiades` container of the one-command install, the compose service in development, or the image's own binary when run inside the image. |
| `eval` | `e` | Runs a quality eval (`--name intents\|tools\|choose-tool\|answers\|decompose`) against the models the running orchestrator uses. Needs the repository checkout. |
| `help` | `h` | Lists the commands with their options. |

`albedo -v` (`--version`) prints the version, `albedo -h` (`--help`) the same list as `help`.

```sh
albedo send -m "What can you do?" -t demo
albedo s -m "hi" -a beta
albedo ac --email you@example.com
albedo e --name answers
```
