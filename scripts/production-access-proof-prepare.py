# SPDX-License-Identifier: Apache-2.0
"""Trusted synthetic-only fixture preparation; never accepts production identity."""
import argparse,base64,json,os,pathlib,secrets,stat,subprocess
assert os.geteuid()==0
p=argparse.ArgumentParser();p.add_argument('--bootstrap-dir',required=True);a=p.parse_args()
bootstrap=pathlib.Path(a.bootstrap_dir).absolute()
for path in [bootstrap,*bootstrap.parents]:
 i=path.lstat();assert stat.S_ISDIR(i.st_mode) and i.st_uid==0 and not i.st_mode&0o022
assert bootstrap.parent.parent==pathlib.Path('/var/lib/meos-qualification')
def read(name):
 path=bootstrap/name;i=path.lstat();assert stat.S_ISREG(i.st_mode) and i.st_uid==0 and not i.st_mode&0o022 and i.st_nlink==1
 return json.loads(path.read_text())
state=read('runtime-state.json');intent=read('bootstrap-receipt.json')
assert state['environment']=='acceptance' and state['instanceId']==intent['instanceId']==bootstrap.parent.name and intent['stage']=='complete'
assert intent['ownerEmail'].endswith('@example.invalid')
folder=bootstrap.parent/'synthetic-access';folder.mkdir(mode=0o700)
private=folder/'private.pem'
clean={'PATH':'/usr/bin:/bin'}
def command(*args):
 r=subprocess.run(args,env=clean,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=30);assert r.returncode==0;return r.stdout
# A restrictive umask applies before private material is generated.
os.umask(0o077)
command('/usr/bin/openssl','genrsa','-out',str(private),'2048');os.chmod(private,0o600)
modulus=command('/usr/bin/openssl','rsa','-in',str(private),'-noout','-modulus').decode().strip().split('=',1)[1]
public=folder/'public';public.mkdir(mode=0o755);os.chmod(public,0o755)
def b64(b):return base64.urlsafe_b64encode(b).rstrip(b'=').decode()
import time
keys={'issuer':'https://synthetic.cloudflareaccess.com','fetchedAt':int(time.time()),'keys':[{'kty':'RSA','kid':'synthetic-lifecycle','alg':'RS256','use':'sig','n':b64(bytes.fromhex(modulus)),'e':'AQAB'}]}
(public/'keys.json').write_text(json.dumps(keys)+'\n');os.chmod(public/'keys.json',0o644)
(folder/'config.json').write_text(json.dumps({'issuer':keys['issuer'],'audience':secrets.token_hex(32),'email':intent['ownerEmail'],'ownerId':intent['ownerId']})+'\n')
print(json.dumps({'status':'synthetic-access-fixtures-created','directory':str(folder)}))
