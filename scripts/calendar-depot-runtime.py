# SPDX-License-Identifier: Apache-2.0
"""Exact runtime-file staging for a STOPPED retained depot, never its database.
Caller owns stop/identity/admission and cold database preservation. Old runtime
bytes remain in rollback; interrupted installs must never start the backend.
"""
import hashlib,json,os,pathlib,re,shutil,stat

def digest(path):
 with path.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()

def allowed(name):
 return name in ['config.textproto','wasm/meos.wasm'] or bool(re.fullmatch(r'migrations/main/U[0-9]+__[A-Za-z0-9_-]+\.sql',name))

def inventory(root):
 root=pathlib.Path(root);assert stat.S_ISDIR(root.lstat().st_mode);result={}
 for name in ['config.textproto','wasm','migrations']:
  target=root/name;info=target.lstat();assert not stat.S_ISLNK(info.st_mode)
  paths=[target] if stat.S_ISREG(info.st_mode) else target.rglob('*')
  for p in paths:
   info=p.lstat();assert stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode),'Special runtime entry'
   if stat.S_ISREG(info.st_mode):
    relative=str(p.relative_to(root));assert allowed(relative) and info.st_nlink==1,'Unexpected runtime file'
    result[relative]=digest(p)
 assert {'config.textproto','wasm/meos.wasm'}<=set(result)
 assert any(n.startswith('migrations/main/') for n in result)
 return result

def package_migrations(source,target):
 source=pathlib.Path(source);target=pathlib.Path(target)
 migrations={p.name:p for p in source.glob('*.sql')}
 assert migrations and all(re.fullmatch(r'U[0-9]+__[A-Za-z0-9_-]+\.sql',n) and p.is_file() and not p.is_symlink() for n,p in migrations.items())
 for old in target.glob('*.sql'):
  assert old.is_file() and not old.is_symlink() and old.name in migrations and digest(old)==digest(migrations[old.name]),'Applied migration rewrite/removal forbidden'
 for name,path in migrations.items():shutil.copyfile(path,target/name)

def verify_bundle(root,expected):
 assert expected and all(allowed(n) and re.fullmatch('[a-f0-9]{64}',d) for n,d in expected.items())
 assert inventory(root)==expected,'Runtime bytes differ from admitted bundle'

def stage(root,bundle,expected,backup,uid=10001,gid=10001):
 root=pathlib.Path(root);bundle=pathlib.Path(bundle);backup=pathlib.Path(backup)
 verify_bundle(bundle,expected);before=inventory(root)
 # Applied migration history must never be rewritten or silently removed.
 assert all(expected.get(n)==d for n,d in before.items() if n.startswith('migrations/')),'Existing migration changed or removed'
 assert not backup.exists();backup.mkdir(mode=0o700)
 for name in before:
  dst=backup/name;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(root/name,dst);dst.chmod(0o600)
 assert inventory(backup)==before
 # Pre-stage all candidate bytes and fsync before replacing any active filename.
 staged=[]
 for name in expected:
  dst=root/name;dst.parent.mkdir(parents=True,exist_ok=True)
  for parent in dst.parents:
   if parent==root:break
   assert not parent.is_symlink()
  temp=dst.with_name(dst.name+'.calendar-pending');fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
  with os.fdopen(fd,'wb') as f:
   with (bundle/name).open('rb') as src:shutil.copyfileobj(src,f)
   f.flush();os.fsync(f.fileno())
  os.chown(temp,uid,gid);temp.chmod(0o444);assert digest(temp)==expected[name];staged.append((temp,dst))
 for temp,dst in staged:
  os.replace(temp,dst);fd=os.open(dst.parent,os.O_RDONLY|os.O_DIRECTORY)
  try:os.fsync(fd)
  finally:os.close(fd)
 assert inventory(root)==expected
 return {'before':before,'after':expected,'rollbackRuntime':str(backup)}
