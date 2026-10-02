#!/usr/bin/env bash
# Deterministic lock-scope guard — W1 pilot (rmax-ai/delegation-queue#95).
#
# mise.lock may only claim the platform this repo is actually resolved and
# tested on. Fails if:
#   1. any platforms.<name> key other than platforms.linux-arm64 exists;
#   2. no platforms.linux-arm64 key exists at all;
#   3. a locked asset resolves to a source / source-map artifact
#      (e.g. source-maps.tgz, sourcemap, sources.tar.gz, *-src.tgz).
#
# Offline + deterministic; no toolchain required. Wired into the moon `check`
# graph as the `lock-scope` task.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$script_dir/../.." && pwd)"
lock="$root/mise.lock"

expected_platform="linux-arm64"
fail=0

if [[ ! -f "$lock" ]]; then
  echo "lock-scope: FAIL: $lock not found" >&2
  exit 1
fi

# Distinct platforms.* keys referenced anywhere in the lock.
platforms="$(grep -oE 'platforms\.[A-Za-z0-9_.-]+' "$lock" | sed 's/^platforms\.//' | sort -u || true)"

if [[ -z "$platforms" ]]; then
  echo "lock-scope: FAIL: mise.lock declares no platforms.* entries (expected platforms.${expected_platform})" >&2
  fail=1
fi

unexpected="$(printf '%s\n' "$platforms" | grep -vx "$expected_platform" || true)"
if [[ -n "$unexpected" ]]; then
  echo "lock-scope: FAIL: mise.lock claims unapproved platform(s):" >&2
  while IFS= read -r p; do
    if [[ -n "$p" ]]; then printf '  platforms.%s\n' "$p" >&2; fi
  done <<< "$unexpected"
  fail=1
fi

if ! printf '%s\n' "$platforms" | grep -qx "$expected_platform"; then
  echo "lock-scope: FAIL: mise.lock does not pin platforms.${expected_platform}" >&2
  fail=1
fi

# Source / source-map artifacts must never be selected as executable assets.
source_re='source[-_ ]?maps?|(^|[^[:alnum:]])(src|sources?)[._-]'
if matches="$(grep -nEi "$source_re" "$lock")"; then
  echo "lock-scope: FAIL: locked asset resolves to a source/source-map artifact:" >&2
  printf '%s\n' "$matches" >&2
  fail=1
fi

if [[ "$fail" -ne 0 ]]; then
  exit 1
fi

echo "lock-scope: OK: platforms = [${expected_platform}]; no source/source-map assets"
