# SPDX-License-Identifier: Apache-2.0
"""Generate the authorized INTERNAL owner secret once. Never reset or print it."""
import json,os,pathlib,secrets,stat,sys
assert os.geteuid()==0 and len(sys.argv)==2
path=pathlib.Path(sys.argv[1]);assert path.is_absolute()
for parent in path.parents:
 i=parent.lstat();assert stat.S_ISDIR(i.st_mode) and i.st_uid==0 and not i.st_mode&0o022
assert stat.S_IMODE(path.parent.stat().st_mode)==0o700
if path.exists():
 i=path.lstat();assert stat.S_ISREG(i.st_mode) and i.st_uid==0 and stat.S_IMODE(i.st_mode)==0o600 and i.st_nlink==1
 data=json.loads(path.read_text());assert set(data)=={'email','password'} and data['email']=='anulman@gmail.com' and len(data['password'])>=32
 print('Internal owner input already present; unchanged')
else:
 fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'w') as file:json.dump({'email':'anulman@gmail.com','password':secrets.token_urlsafe(48)},file);file.flush();os.fsync(file.fileno())
 print('Internal owner input generated; no user password required')
