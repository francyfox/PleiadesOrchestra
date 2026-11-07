#!/usr/bin/env bash
# Ping IndexNow (Bing, Yandex, Seznam, Naver…) with every URL in the built sitemap, once the
# new docs build is actually live on pleiades.shalotts.site (the VPS poller swaps it in within
# ~1 min). Never fails the workflow: a missed ping only delays indexing.
set -uo pipefail
HOST=pleiades.shalotts.site
BUILD=apps/docs/build
KEY=$(ls "$BUILD"/*.txt 2>/dev/null | grep -E '/[0-9a-f]{32}\.txt$' | head -1 | xargs -r basename | sed 's/\.txt$//')
[ -n "$KEY" ] || { echo "no IndexNow key file in $BUILD/"; exit 0; }

want=$(sha256sum "$BUILD/index.html" | cut -d' ' -f1)
for _ in $(seq 1 30); do
  have=$(curl -fsS "https://$HOST/" 2>/dev/null | sha256sum | cut -d' ' -f1)
  [ "$have" = "$want" ] && break
  sleep 10
done
[ "$have" = "$want" ] || echo "new build not live after 5 min, pinging anyway"

urls=$(grep -oE '<loc>[^<]+' "$BUILD/sitemap.xml" | sed 's/<loc>//' | sed 's/.*/"&"/' | paste -sd,)
# IndexNow caps one request at 10,000 URLs; the sitemap is far below that.
curl -sS -o /dev/null -w "IndexNow: HTTP %{http_code}\n" -X POST https://api.indexnow.org/indexnow \
  -H 'Content-Type: application/json; charset=utf-8' \
  -d "{\"host\":\"$HOST\",\"key\":\"$KEY\",\"keyLocation\":\"https://$HOST/$KEY.txt\",\"urlList\":[$urls]}" || true
