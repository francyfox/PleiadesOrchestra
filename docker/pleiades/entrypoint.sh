#!/bin/sh
# shortcut: three processes without a supervisor; if one dies the container exits and
# `--restart` brings all back. Upgrade to s6/tini-style supervision if they need independent restarts.
mkdir -p /data/alpha-orchestrator /data/admin

PORT=3000 alpha-orchestrator &
a=$!
PORT=3003 admin-api &
b=$!
caddy run --config /etc/caddy/Caddyfile --adapter caddyfile &
c=$!

trap 'kill $a $b $c 2>/dev/null; exit 0' TERM INT
while kill -0 $a 2>/dev/null && kill -0 $b 2>/dev/null && kill -0 $c 2>/dev/null; do sleep 1; done
kill $a $b $c 2>/dev/null
exit 1
