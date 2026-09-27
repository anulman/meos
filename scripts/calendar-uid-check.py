# SPDX-License-Identifier: Apache-2.0
# Trusted host-visible prestart; no application imports or credentials.
import grp,os,pathlib,pwd
assert os.geteuid()==0
for lookup in [pwd.getpwuid,grp.getgrgid]:
 try:lookup(61004)
 except KeyError:pass
 else:raise AssertionError('Reserved Calendar UID/GID assigned to a host account')
for path in pathlib.Path('/proc').glob('[0-9]*/status'):
 try:lines=path.read_text().splitlines()
 except FileNotFoundError:continue
 for line in lines:
  if line.startswith(('Uid:','Gid:','Groups:')):assert '61004' not in line.split()[1:],'Calendar UID/GID already active'
