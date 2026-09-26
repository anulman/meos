# SPDX-License-Identifier: Apache-2.0
# Trusted bounded launcher: repository tests never see credentials or production networking.
import os,pathlib,subprocess,sys
assert os.geteuid()==0
root=pathlib.Path(__file__).resolve().parents[1]
node=pathlib.Path('/home/clawy/.local/share/mise/installs/node/24.19.0')
props={'PrivateNetwork':'yes','ProtectHome':'tmpfs','ProtectSystem':'strict','PrivateTmp':'yes','NoNewPrivileges':'yes','InaccessiblePaths':'/mnt /var/lib -/run/docker.sock -/run/k3s','BindReadOnlyPaths':' '.join(str(root/p) for p in ['backend','scripts','src','docs','package.json'])+' '+str(node),'MemoryMax':'700M','TasksMax':'48','CapabilityBoundingSet':'CAP_SETUID CAP_SETGID CAP_SETPCAP','WorkingDirectory':'/tmp'}
typecheck=sys.argv[1:]==['--typecheck'];assert len(sys.argv)==1 or typecheck
compiler=root/'.qualification/trailbase-3dfb2f70d8266036f1e7e9db4902e8b81026f69d/node_modules/.pnpm/typescript@5.9.3/node_modules/typescript'
if typecheck:props['BindReadOnlyPaths']+=' '+str(compiler)
cmd=['systemd-run','--wait','--pipe','--collect']+[f'--property={k}={v}' for k,v in props.items()]+['/usr/bin/setpriv','--reuid=10001','--regid=10001','--clear-groups','--bounding-set=-all','/usr/bin/env','-i','PATH=/usr/bin:/bin',str(node/'bin/node'),'--test']+[str(p) for p in sorted((root/'scripts').glob('backend-*-tests.mjs'))]+[str(root/'scripts/backend-tests.mjs')]
if typecheck:
 marker=cmd.index('--test');cmd=cmd[:marker]+[str(compiler/'bin/tsc'),'--noEmit','--strict','--target','es2022','--module','esnext','--lib','es2022,dom',str(root/'src/lib/backend/generated.ts')]
sys.exit(subprocess.run(cmd).returncode)
