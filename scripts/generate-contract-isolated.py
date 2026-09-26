# SPDX-License-Identifier: Apache-2.0
# Trusted isolated contract generation; no secrets, host home, or network.
import os,pathlib,tempfile,shutil,subprocess,json
assert os.geteuid()==0
repo=pathlib.Path(__file__).resolve().parents[1]
root=pathlib.Path(tempfile.mkdtemp(prefix='meos-contract-'));root.chmod(0o755)
for name in ['backend','scripts']:shutil.copytree(repo/name,root/name)
for name in ['docs','src/lib/backend']:(root/name).mkdir(parents=True)
for p in root.rglob('*'):os.chown(p,10001,10001)
node='/home/clawy/.local/share/mise/installs/node/24.19.0'
props={'PrivateNetwork':'yes','ProtectHome':'tmpfs','ProtectSystem':'strict','PrivateTmp':'yes','InaccessiblePaths':'/mnt /var/lib /root -/run/docker.sock','BindPaths':str(root)+':/work','BindReadOnlyPaths':node+':/opt/node','WorkingDirectory':'/work','NoNewPrivileges':'yes','CapabilityBoundingSet':'CAP_SETUID CAP_SETGID CAP_SETPCAP'}
subprocess.run(['systemd-run','--wait','--pipe','--collect']+[f'--property={k}={v}' for k,v in props.items()]+['/usr/bin/setpriv','--reuid=10001','--regid=10001','--clear-groups','--bounding-set=-all','/usr/bin/env','-i','PATH=/usr/bin:/bin','/opt/node/bin/node','scripts/generate-contract.mjs'],env={'PATH':'/usr/bin:/bin'},check=True)
for name in ['docs/openapi.json','src/lib/backend/generated.ts']:
 target=repo/name;target.write_bytes((root/name).read_bytes());os.chown(target,repo.stat().st_uid,repo.stat().st_gid)
print('Generated contract in isolated namespace')
