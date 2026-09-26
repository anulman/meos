#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Assemble an offline, pinned Linux amd64 host bundle. No installation/network."""
import argparse,hashlib,json,os,pathlib,shutil,tarfile
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--age-archive',required=True);p.add_argument('--output',required=True);a=p.parse_args()
root=pathlib.Path(__file__).resolve().parent;policy=json.loads((root/'licenses.json').read_text());archive=pathlib.Path(a.age_archive)
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
assert sha(archive)==policy['ageArchiveSHA256'],'unadmitted age archive'
assert policy['license']=='BSD-3-Clause'
for item in policy['components']:
 assert item['license']=='BSD-3-Clause' and sha(root/'notices'/item['notice'])==item['sha256'],'notice gate failed'
out=pathlib.Path(a.output).absolute();assert not out.exists();out.mkdir(mode=0o700)
shutil.copyfile(root/'meos-backup.py',out/'meos-backup.py');shutil.copyfile(root/'licenses.json',out/'licenses.json');shutil.copytree(root/'notices',out/'notices')
(out/'runtime').mkdir()
with tarfile.open(archive) as tar:
 for name in ['age','age-keygen']:
  m=tar.getmember('age/'+name);assert m.isfile();(out/'runtime'/name).write_bytes(tar.extractfile(m).read());os.chmod(out/'runtime'/name,0o555)
assert sha(out/'runtime/age')==policy['ageBinarySHA256']
manifest={'schema':1,'status':'packaged-not-installed','platform':'linux-amd64','pythonMinimum':'3.11','files':{str(p.relative_to(out)):sha(p) for p in out.rglob('*') if p.is_file()}}
(out/'package-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'status':'packaged-not-installed','output':str(out),'files':len(manifest['files'])}))
