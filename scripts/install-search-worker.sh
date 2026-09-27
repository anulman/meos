#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
# Run only after admitting the release and explicitly approving provider processing.
set -eu
release=${1:?usage: install-search-worker.sh /absolute/admitted/release}
case "$release" in /*) ;; *) echo 'Absolute admitted release path required' >&2; exit 1;; esac
case "$release" in *[!a-zA-Z0-9_./-]*) echo 'Unsupported release path' >&2; exit 1;; esac
[ -f "$release/backend/search-worker.mjs" ]
[ -f /etc/meos/search.env ] || { echo 'Provision /etc/meos/search.env privately first' >&2; exit 1; }
command -v varlock >/dev/null || { echo 'Install the admitted Varlock CLI first' >&2; exit 1; }
# Validate using the release-owned schema; never print credentials.
varlock_bin=$(command -v varlock)
case "$varlock_bin" in /*) ;; *) echo 'Absolute Varlock executable required' >&2; exit 1;; esac
id meos-search >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin meos-search
chmod 600 /etc/meos/search.env
sed -e "s|WorkingDirectory=/opt/meos/current|WorkingDirectory=$release|" -e "s|ExecStart=/usr/bin/node scripts/search-worker.mjs|ExecStart=$varlock_bin run --path $release/deployment/search.env.schema -- /usr/bin/node scripts/search-worker.mjs|" "$release/deployment/meos-search.service" > /etc/systemd/system/meos-search.service
install -m 644 "$release/deployment/meos-search.timer" /etc/systemd/system/meos-search.timer
systemctl daemon-reload
printf '%s\n' 'Installed, not enabled. Verify the native grant and run doctor before enabling meos-search.timer.'
