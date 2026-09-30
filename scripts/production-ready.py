# SPDX-License-Identifier: Apache-2.0
"""Trusted systemd readiness/ACL helper. No credentials, SQL, or repository tests."""
import http.client,json,os,pathlib,socket,stat,subprocess,time,pwd,grp
from deployment_config import origin as validated_origin
assert os.geteuid()==0
# Reserved socket-only relay identity must not alias a human/service account.
for lookup in [pwd.getpwuid,grp.getgrgid]:
 try:lookup(61006)
 except KeyError:pass
 else:raise AssertionError('Relay UID/GID61006 is already assigned; reconcile before granting socket access')
config=pathlib.Path('/etc/meos/runtime-state.json');info=config.lstat()
assert stat.S_ISREG(info.st_mode) and info.st_uid==0 and not info.st_mode&0o022
state=json.loads(config.read_text());assert set(state)=={'environment','instanceId','image','containerId','volume','origin'}
environment=state['environment'];run=state['instanceId'];assert environment in ['production','acceptance'] and len(run)==32 and all(c in '0123456789abcdef' for c in run)
validated_origin(state['origin']);assert state['image'].startswith('sha256:')
name='meos-'+environment+'-'+run;assert state['volume']==name+'-data'
clean={'PATH':'/usr/bin:/bin'}
def inspect(kind,target):return json.loads(subprocess.check_output(['/usr/bin/docker','--host','unix:///var/run/docker.sock',kind,'inspect',target],env=clean,stderr=subprocess.DEVNULL))[0]
def verify():
 c=inspect('container',name);v=inspect('volume',state['volume']);h=c['HostConfig']
 assert c['Id']==state['containerId'] and c['Image']==state['image'] and c['State']['Running']
 assert c['Config']['User']=='10001:10001' and set(c['Config']['Env'])=={'RUST_LOG=warn','XDG_CACHE_HOME=/data/.cache'}
 assert h['NetworkMode']=='none' and set(c['NetworkSettings']['Networks'])=={'none'} and h['ReadonlyRootfs'] and not h['Privileged'] and not h['Binds'] and not h['PortBindings'] and not h.get('VolumesFrom')
 assert h['CapDrop']==['ALL'] and not h['CapAdd'] and h['SecurityOpt']==['no-new-privileges'] and not h['PidMode'] and h['IpcMode']=='private' and not h['Devices']
 for obj in [c['Config'],v]:
  assert obj['Labels']['meos.environment']==environment
  assert obj['Labels']['meos.'+('acceptance.run' if environment=='acceptance' else 'production.instance')]==run
 assert v['Name']==state['volume'] and v['Driver']=='local' and not v['Options']
 mounts=[m for m in c['Mounts'] if m['Type']!='tmpfs'];assert len(mounts)==1 and mounts[0]['Name']==v['Name'] and mounts[0]['Destination']=='/data'
 return pathlib.Path(v['Mountpoint'])
class UDS(http.client.HTTPConnection):
 def __init__(self,root):super().__init__(state['origin'].removeprefix('https://'),timeout=2);self.root=root
 def connect(self):
  self.sock=socket.socket(socket.AF_UNIX);self.sock.settimeout(self.timeout)
  fd=os.open(self.root,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
  try:self.sock.connect('/proc/self/fd/'+str(fd)+'/server.sock')
  finally:os.close(fd)
deadline=time.monotonic()+60
while True:
 root=verify();sock=root/'server.sock'
 try:
  info=sock.lstat();assert stat.S_ISSOCK(info.st_mode) and info.st_uid==10001
  client=UDS(root)
  try:
   client.request('GET','/api/meos/v1/instance');response=client.getresponse();body=response.read(8193)
   assert response.status==200 and len(body)<=8192 and json.loads(body)=={'instanceId':run,'environment':'production'}
  finally:client.close()
  subprocess.run(['/usr/bin/setfacl','-m','u:61002:rw,u:61004:rw,u:61006:rw',str(sock)],env=clean,check=True)
  break
 except (FileNotFoundError,ConnectionRefusedError,TimeoutError):
  if time.monotonic()>=deadline:raise RuntimeError('Backend readiness timeout')
  time.sleep(.1)
