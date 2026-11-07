#!/bin/bash
# with-dev.sh — start the Next.js dev server, wait for readiness, run the
# given command, then stop the server. Processes spawned by a Bash tool call
# are reaped when the call ends, so server + dependent work must share one
# invocation.
#
# Usage: bash scripts/with-dev.sh <command...>

set -u
cd /home/z/my-project

rm -f dev.log
setsid bash -c 'exec bun run dev' < /dev/null > /dev/null 2>&1 &
DEV_WRAPPER=$!

ready=0
for i in $(seq 1 90); do
  code=$(curl -s -o /dev/null -m 2 -w "%{http_code}" http://localhost:3000/api/v1/auth/me 2>/dev/null || true)
  if [ "$code" = "401" ] || [ "$code" = "200" ]; then ready=1; break; fi
  sleep 1
done

if [ "$ready" != "1" ]; then
  echo "DEV SERVER FAILED TO START"; tail -30 dev.log 2>/dev/null
  kill $DEV_WRAPPER 2>/dev/null
  exit 1
fi

echo "── dev server ready ──"
"$@"
rc=$?

# stop the server tree
pkill -P $DEV_WRAPPER 2>/dev/null
kill $DEV_WRAPPER 2>/dev/null
pkill -f "next dev -p 3000" 2>/dev/null
pkill -f "next-server" 2>/dev/null
sleep 1
exit $rc
