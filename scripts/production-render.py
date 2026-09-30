# SPDX-License-Identifier: Apache-2.0
"""Render reviewed unit templates into a NEW private output dir. Never install/start units.
Arguments are nonsecret paths: --state FILE --release DIR --output DIR.
The root-owned state comes from trusted bootstrap (production) or acceptance proof.
"""
import argparse,hashlib,json,os,pathlib,re,stat,subprocess
from deployment_config import origin as validated_origin, issuer as validated_issuer, email as validated_email
assert os.geteuid()==0
parser=argparse.ArgumentParser();parser.add_argument('--state',required=True);parser.add_argument('--release',required=True);parser.add_argument('--output',required=True);parser.add_argument('--access-config');parser.add_argument('--owner-file');parser.add_argument('--access-keys-dir');parser.add_argument('--calendar',action='store_true');args=parser.parse_args()
repo=pathlib.Path(__file__).resolve().parents[1]
state_path=pathlib.Path(args.state).absolute();release=pathlib.Path(args.release).absolute();output=pathlib.Path(args.output).absolute()
def secure(path,directory=False):
 i=path.lstat();assert i.st_uid==0 and not i.st_mode&0o022
 assert stat.S_ISDIR(i.st_mode) if directory else stat.S_ISREG(i.st_mode)
 for p in path.parents:
  i=p.lstat();assert stat.S_ISDIR(i.st_mode) and i.st_uid==0 and not i.st_mode&0o022
secure(state_path);secure(release,True)
state=json.loads(state_path.read_text());assert set(state)=={'environment','instanceId','image','containerId','volume','origin'}
run=state['instanceId'];assert re.fullmatch('[a-f0-9]{32}',run)
assert re.fullmatch('sha256:[a-f0-9]{64}',state['image']) # Exact independently reviewed manifest below is authoritative.
validated_origin(state['origin']);assert state['environment'] in ['production','acceptance']
name='meos-'+state['environment']+'-'+run;assert state['volume']==name+'-data'
assert re.fullmatch('[a-f0-9]{64}',state['containerId'])
manifest_path=release/'manifest.json';secure(manifest_path)
manifest=json.loads(manifest_path.read_text());assert manifest['image']==state['image']
if state['environment']=='production':
 assert manifest['status']=='independently-reviewed' and manifest['runtimeUse']=='production-reviewed' and manifest['nodeRuntimeLicenseReview']
else:assert manifest['status'] in ['qualification-only','independently-reviewed']
assert manifest['reviewEvidence'] and manifest['sourceCommit'] and manifest['files']
assert all(not p.is_symlink() for p in release.rglob('*'))
files={str(p.relative_to(release)) for p in release.rglob('*') if p.is_file()};assert files==set(manifest['files'])|{'manifest.json'}
for relative,digest in manifest['files'].items():
 assert not pathlib.PurePosixPath(relative).is_absolute() and '..' not in pathlib.PurePosixPath(relative).parts
 path=release/relative;secure(path);assert hashlib.sha256(path.read_bytes()).hexdigest()==digest
required=['scripts/production-ready.py','scripts/production-uid-check.py','scripts/production-web-exec.py','scripts/serve-real.mjs','backend/node-web-server.mjs','client/_shell.html']
assert all(path in manifest['files'] for path in required)
prefix='meos' if state['environment']=='production' else 'meos-proof-'+run
assert args.access_config and args.owner_file and args.access_keys_dir, 'Access owner wiring is mandatory'
access_path=pathlib.Path(args.access_config).absolute();owner_path=pathlib.Path(args.owner_file).absolute();keys_dir=pathlib.Path(args.access_keys_dir).absolute()
secure(access_path);secure(owner_path);secure(keys_dir,True)
assert stat.S_IMODE(owner_path.stat().st_mode)==0o600 and owner_path.stat().st_nlink==1
access=json.loads(access_path.read_text());owner=json.loads(owner_path.read_text())
assert set(owner)=={'email','password'} and access['email']==owner['email'] and len(owner['password'])>=32
assert set(access)=={'issuer','audience','email','ownerId'}
validated_issuer(access['issuer']);validated_email(access['email'])
assert access['email'].endswith('@example.invalid') is (state['environment']=='acceptance')
assert re.fullmatch('[a-f0-9]{64}',access['audience']) and re.fullmatch('[a-f0-9-]{36}',access['ownerId'])
assert not output.exists();output.mkdir(mode=0o700,parents=False)
identity=output/'web-identity.json';identity.write_text(json.dumps({'environment':'production','instanceId':run,'origin':state['origin'],'access':access})+'\n');os.chmod(identity,0o644)
runtime_owner=output/'owner.json';runtime_owner.write_text(json.dumps(owner));os.chown(runtime_owner,0,61002);os.chmod(runtime_owner,0o440);del owner
# Discover the daemon's actual volume root (Docker data-root may be relocated).
# Never accept a caller-selected socket or assume /var/lib/docker.
def inspect(kind,name):
 result=subprocess.run(['/usr/bin/docker','--host','unix:///var/run/docker.sock',kind,'inspect',name],env={'PATH':'/usr/bin:/bin'},stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=15)
 assert result.returncode==0
 values=json.loads(result.stdout);assert len(values)==1
 return values[0]
volume=inspect('volume',state['volume']);container=inspect('container',state['containerId'])
assert volume['Name']==state['volume'] and volume['Driver']=='local' and not volume['Options']
assert container['Id']==state['containerId'] and container['Image']==state['image'] and container['HostConfig']['NetworkMode']=='none'
identity_key='meos.production.instance' if state['environment']=='production' else 'meos.acceptance.run'
for labels in [volume['Labels'],container['Config']['Labels']]:
 assert labels['meos.environment']==state['environment'] and labels[identity_key]==run
mounts=[m for m in container['Mounts'] if m['Type']!='tmpfs']
assert len(mounts)==1 and mounts[0]['Type']=='volume' and mounts[0]['Name']==state['volume'] and mounts[0]['Destination']=='/data' and mounts[0]['Source']==volume['Mountpoint']
volume_root=pathlib.Path(volume['Mountpoint']);assert volume_root.is_absolute() and volume_root.is_dir() and not volume_root.is_symlink()
socket_path=str(volume_root/'server.sock')
node=str(release/'runtime/node')
values={'PREFIX':prefix,'CONTAINER':state['containerId'],'RELEASE':str(release),'NODE':node,'SOCKET':socket_path,'IDENTITY':str(identity),'STATE':str(state_path),'OWNER':str(runtime_owner),'ACCESS_KEYS':str(keys_dir),'PORT':'3190' if state['environment']=='production' else '3191','CALENDAR_BIND':''}
if args.calendar:
 assert state['environment']=='production'
 calendar_socket=pathlib.Path('/run/meos-calendar/control.sock');i=calendar_socket.lstat();assert stat.S_ISSOCK(i.st_mode) and i.st_uid==61002 and stat.S_IMODE(i.st_mode)==0o600
 values['CALENDAR_BIND']='/run/meos-calendar:/run/meos/calendar'
for value in values.values():assert value=='' or re.fullmatch(r'[A-Za-z0-9_./:-]+',value), 'Unsafe systemd substitution'
rendered={}
templates=[('meos-backend.service.in','-backend.service'),('meos-web.service.in','-web.service'),('meos-web.socket','-web.socket')]
if state['environment']=='production':templates += [('meos-access-keys.service.in','-access-keys.service'),('meos-access-keys.timer','-access-keys.timer')]
for source,suffix in templates:
 text=(repo/'deployment'/source).read_text()
 for key,value in values.items():text=text.replace('@'+key+'@',value)
 assert not re.search('@[A-Z_]+@',text)
 target=output/(prefix+suffix);target.write_text(text);os.chmod(target,0o644);rendered[target.name]=hashlib.sha256(target.read_bytes()).hexdigest()
(output/'render-receipt.json').write_text(json.dumps({'status':'rendered-not-installed','environment':state['environment'],'instanceId':run,'image':state['image'],'release':str(release),'releaseManifestSHA256':hashlib.sha256(manifest_path.read_bytes()).hexdigest(),'state':str(state_path),'units':rendered,'prefix':prefix},indent=2)+'\n')
print(json.dumps({'status':'rendered-not-installed','output':str(output),'prefix':prefix}))
