#!/bin/sh
set -eu
# Strict allowlist prevents script injection without adding a runtime language.
timezone="${MEOS_TIMEZONE:-UTC}"
api="${MEOS_API_BASE:-/api}"
demo="${MEOS_DEMO:-true}"
case "$timezone" in *[!A-Za-z0-9_+/-]*|'') echo 'Invalid timezone' >&2; exit 1;; esac
case "$api" in *[!A-Za-z0-9_/-]*|'') echo 'Invalid API base' >&2; exit 1;; esac
case "$api" in /*) ;; *) exit 1;; esac
[ "$demo" = true ] || { echo 'Preview requires demo=true' >&2; exit 1; }
printf 'window.MEOS_CONFIG = {"timezone":"%s","apiBase":"%s","demo":true};\n' "$timezone" "$api" > /usr/share/nginx/html/config.js
