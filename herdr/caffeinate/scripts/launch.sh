#!/bin/sh
# No profiles, version managers, runtime downloads, or dependency installation.
node_path=$(command -v node) || {
  printf '%s\n' 'Caffeinate requires Node 24.x (minimum 24.0.0) on PATH. Install a supported Node separately and make it available to Herdr.' >&2
  exit 127
}
case $0 in
  */*) directory=${0%/*} ;;
  *) directory=. ;;
esac
root=$(CDPATH= cd "$directory/.." && pwd) || exit 1
"$node_path" "$root/scripts/preflight.cjs" runtime || exit $?
exec "$node_path" "$root/dist/main.js" "$@"
