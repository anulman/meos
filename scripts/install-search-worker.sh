#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
# Run only after admitting the release and explicitly approving provider processing.
set -eu
[ "$(id -u)" = 0 ] || { echo 'Run the admitted installer as root' >&2; exit 1; }
release=${1:?usage: install-search-worker.sh /absolute/admitted/release /absolute/admitted/backend.sock}
backend_socket=${2:?admitted private native socket required}
case "$backend_socket" in /*) ;; *) echo 'Absolute native socket required' >&2; exit 1;; esac
case "$backend_socket" in *[!a-zA-Z0-9_./-]*) echo 'Unsupported native socket path' >&2; exit 1;; esac
[ -S "$backend_socket" ] || { echo 'Admitted native socket is not present' >&2; exit 1; }
case "$release" in /*) ;; *) echo 'Absolute admitted release path required' >&2; exit 1;; esac
case "$release" in *[!a-zA-Z0-9_./-]*) echo 'Unsupported release path' >&2; exit 1;; esac
[ -f "$release/backend/search-worker.mjs" ]
[ -x "$release/runtime/node/bin/node" ]
python3 - "$release" <<'VERIFY'
import hashlib,json,pathlib,stat,sys
release=pathlib.Path(sys.argv[1])
for parent in [release,*release.parents]:
 i=parent.lstat();assert stat.S_ISDIR(i.st_mode) and i.st_uid==0 and not i.st_mode&0o022, 'Release path must be root-owned and immutable to other users'
manifest_path=release/'manifest.json';i=manifest_path.lstat();assert stat.S_ISREG(i.st_mode) and i.st_uid==0 and not i.st_mode&0o022
manifest=json.loads(manifest_path.read_text());assert manifest['status']=='independently-reviewed' and manifest['runtimeUse']=='production-reviewed'
required=['runtime/node/bin/node','scripts/search-worker.mjs','scripts/install-search-worker.sh','backend/search-client.mjs','backend/search-worker.mjs','backend/node-web-server.mjs','backend/protected-proxy.mjs','backend/domain.mjs','backend/body.mjs','backend/contract.mjs','backend/scheduling.mjs','backend/timezones.mjs','backend/timezone-rules.mjs','deployment/meos-search.service','deployment/meos-search.timer','deployment/search.env.schema']
for name in required:
 p=release/name;i=p.lstat();assert stat.S_ISREG(i.st_mode) and i.st_uid==0 and not i.st_mode&0o022
 assert hashlib.sha256(p.read_bytes()).hexdigest()==manifest['files'][name], 'Release file digest mismatch: '+name
VERIFY
[ -f /etc/meos/search.env ] || { echo 'Provision /etc/meos/search.env privately first' >&2; exit 1; }
command -v varlock >/dev/null || { echo 'Install the admitted Varlock CLI first' >&2; exit 1; }
# Validate using the release-owned schema; never print credentials.
varlock_bin=$(command -v varlock)
case "$varlock_bin" in /*) ;; *) echo 'Absolute Varlock executable required' >&2; exit 1;; esac
id meos-search >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin meos-search
chmod 600 /etc/meos/search.env
sed -e "s|@BACKEND_SOCKET@|$backend_socket|" -e "s|WorkingDirectory=/opt/meos/current|WorkingDirectory=$release|" -e "s|ExecStart=/usr/bin/node scripts/search-worker.mjs|ExecStart=$varlock_bin run --path $release/deployment/search.env.schema -- $release/runtime/node/bin/node scripts/search-worker.mjs|" "$release/deployment/meos-search.service" > /etc/systemd/system/meos-search.service
install -m 644 "$release/deployment/meos-search.timer" /etc/systemd/system/meos-search.timer
systemctl daemon-reload
printf '%s\n' 'Installed, not enabled. Verify the native grant and run doctor before enabling meos-search.timer.'
