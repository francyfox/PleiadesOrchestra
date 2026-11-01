#!/bin/sh
# shortcut: two processes without a supervisor; if one dies the container exits and
# `--restart` brings both back. Upgrade to s6/tini-style supervision if they need independent restarts.
mkdir -p /data/alpha-orchestrator /data/admin

PORT=3000 DATABASE_PATH=/data/alpha-orchestrator/orchestrator.db alpha-orchestrator &
a=$!
PORT=3003 ADMIN_DATABASE_PATH=/data/admin/admin.db HARNESS_BASE_URL=http://127.0.0.1:3000 admin-api &
b=$!

trap 'kill $a $b 2>/dev/null; exit 0' TERM INT
while kill -0 $a 2>/dev/null && kill -0 $b 2>/dev/null; do sleep 1; done
kill $a $b 2>/dev/null
exit 1
