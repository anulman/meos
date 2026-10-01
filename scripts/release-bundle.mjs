// SPDX-License-Identifier: Apache-2.0
import {createRequire} from 'node:module'
import {readFileSync,writeFileSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
const require=createRequire(import.meta.url)
// Verify isolation before loading any project module (esbuild does not execute it).
const probe=spawnSync('/usr/bin/python3',['-c',`import socket,os,json,errno
from pathlib import Path
proof=json.loads(Path('/work/isolation-input.json').read_text())
assert os.geteuid()==os.getegid()==proof['buildUid']==61003
assert os.getgroups() in [[],[61003]]
assert proof['dedicatedUidPreflight'] is True and proof['exclusiveRootLease'] is True
assert proof['hostDecoyPositiveControl'] is True
assert {d['uid'] for d in proof['decoys']}=={10001,61002}
for decoy in proof['decoys']:
 assert decoy['uid'] in [10001,61002] and decoy['uid']!=os.geteuid()
 for name in ['root','fd/'+str(decoy['fd'])]:
  try:os.readlink('/proc/'+str(decoy['pid'])+'/'+name)
  except OSError as e:assert e.errno in [errno.EACCES,errno.EPERM,errno.ENOENT]
  else:raise AssertionError('Host decoy proc link visible')
 for name in ['fd/'+str(decoy['fd']),'environ']:
  try:
   fd=os.open('/proc/'+str(decoy['pid'])+'/'+name,os.O_RDONLY);os.close(fd)
  except OSError as e:assert e.errno in [errno.EACCES,errno.EPERM,errno.ENOENT]
  else:raise AssertionError('Host decoy proc contents accessible')
status=Path('/proc/self/status').read_text()
assert all(int(line.split()[1],16)==0 for line in status.splitlines() if line.startswith(('CapEff:','CapPrm:','CapBnd:','CapAmb:')))
assert set(os.environ)=={'PATH','HOME','LANG','ESBUILD_BINARY_PATH'}
assert not Path('/home/clawy').exists()
assert not os.access('/var/lib',os.R_OK)
assert not os.access('/mnt',os.R_OK)
assert not os.path.exists('/run/docker.sock')
assert not os.path.exists('/var/run/docker.sock')
assert set(os.listdir('/sys/class/net'))=={'lo'}
s=socket.socket();s.settimeout(1)
try:s.connect(('1.1.1.1',443));raise AssertionError('external network reachable')
except OSError:pass
`],{stdio:'inherit'})
if(probe.status!==0)throw Error('Build isolation proof failed')
writeFileSync('/work/isolation-proof.json',JSON.stringify({uid:61003,dedicatedUidPreflight:true,exclusiveRootLease:true,hostProcDecoysDenied:[10001,61002],hostDecoyPositiveControl:true,capabilities:'none',network:'private-loopback-only',externalNetworkDenied:true,dockerSocketAbsent:true,origin:'https://meos.aidans.computer',compiledEnvironment:'production'}))
if(process.argv.slice(2).length){
 if(process.argv.length!==3||process.argv[2]!=='--isolation-only')throw Error('Unknown release probe mode')
 process.exit(0)
}
const esbuild=require('/opt/esbuild/lib/main.js')
const result=await esbuild.build({entryPoints:['backend/guest/entry.mjs'],outfile:'/work/guest-bundle.mjs',bundle:true,format:'esm',platform:'neutral',mainFields:['module','main'],target:'es2022',nodePaths:['/opt/guest-deps/node_modules'],external:['wasi:*','trailbase:*'],define:{MEOS_GUEST_ENVIRONMENT:JSON.stringify('production')},metafile:true,legalComments:'eof'})
const approved=new Set(JSON.parse(readFileSync('backend/guest-dependencies.json')).packages.map(p=>p.name))
for(const name of Object.keys(result.metafile.inputs)) {
 const parts=name.split('/node_modules/')
 if(parts.length>1&&!approved.has(parts.at(-1).split('/')[0]))throw Error('Unadmitted bundled package: '+name)
 if(parts.length===1&&!name.startsWith('backend/'))throw Error('Unadmitted source: '+name)
}
writeFileSync('/work/guest-bundle-metafile.json',JSON.stringify(result.metafile,null,2))
const compile=spawnSync('/opt/componentize-qjs',['--sync','--wit','/opt/guest-wit','--js','/work/guest-bundle.mjs','--output','/work/meos-guest.wasm'],{stdio:'inherit',env:{HOME:'/tmp',PATH:'/usr/bin:/bin'}})
if(compile.status!==0)throw Error('Compilation failed')
