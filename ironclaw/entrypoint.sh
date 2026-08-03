#!/bin/sh
set -e

mkdir -p "$IRONCLAW_REBORN_HOME"

if [ ! -f "$IRONCLAW_REBORN_HOME/config.toml" ]; then
    echo "No existing config found in $IRONCLAW_REBORN_HOME, running headless onboarding..."
    ironclaw onboard --no-service < /dev/null || true
fi

exec ironclaw serve --host 0.0.0.0 --port "${PORT:-3000}"
