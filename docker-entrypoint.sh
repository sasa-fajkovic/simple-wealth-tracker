#!/bin/sh
# Container entrypoint: best-effort fix /data ownership, then drop privileges.
#
# Why: /data is typically a host bind mount whose ownership is set by the host,
# not the image. If it doesn't match the `node` user (uid 1000), the app crashes
# with EACCES on first boot. Running as root briefly lets us chown the mount,
# then `su-exec` drops privileges before exec-ing the app.
set -eu

DATA_DIR="${DATA_DIR:-/data}"

if [ "$(id -u)" = "0" ]; then
  # Best-effort: silently ignore failure (e.g. read-only volume) — the app's
  # own preflight check will surface a clear, actionable error if /data is
  # truly unwritable.
  mkdir -p "$DATA_DIR" 2>/dev/null || true
  chown -R node:node "$DATA_DIR" 2>/dev/null || true
  exec su-exec node:node "$@"
fi

# Already non-root (custom `--user` flag) — just exec.
exec "$@"
