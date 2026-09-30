# SPDX-License-Identifier: Apache-2.0
"""Root-only public Cloudflare signing-key refresh. No credentials or application code.
Root-owned configured issuer; one root-owned public directory; atomic replacement.
"""
import json,os,pathlib,stat,sys,time,urllib.request
from deployment_config import issuer as validated_issuer
assert os.geteuid()==0 and len(sys.argv)==3
identity=pathlib.Path(sys.argv[1]);info=identity.lstat()
assert stat.S_ISREG(info.st_mode) and info.st_uid==0 and not info.st_mode&0o022 and info.st_nlink==1
for parent in identity.parents:
 info=parent.lstat();assert stat.S_ISDIR(info.st_mode) and info.st_uid==0 and not info.st_mode&0o022
issuer=validated_issuer(json.loads(identity.read_text())["access"]["issuer"])
root=pathlib.Path(sys.argv[2]);assert root.is_absolute()
for parent in [root,*root.parents]:
 i=parent.lstat();assert stat.S_ISDIR(i.st_mode) and i.st_uid==0 and not i.st_mode&0o022
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):raise ValueError('Redirect denied')
with urllib.request.build_opener(NoRedirect).open(issuer+'/cdn-cgi/access/certs',timeout=20) as response:
 assert response.status==200
 raw=response.read(65537);assert len(raw)<=65536
 keys=json.loads(raw)['keys'];assert isinstance(keys,list) and 1<=len(keys)<=20
 for key in keys:assert key['kty']=='RSA' and isinstance(key['kid'],str) and isinstance(key['n'],str) and isinstance(key['e'],str) and 'd' not in key
 bundle={'issuer':issuer,'fetchedAt':int(time.time()),'keys':keys}
tmp=root/('keys-'+os.urandom(8).hex()+'.tmp')
fd=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o644)
with os.fdopen(fd,'w') as file:json.dump(bundle,file);file.flush();os.fsync(file.fileno())
os.replace(tmp,root/'keys.json')
print('Access public signing keys refreshed')
