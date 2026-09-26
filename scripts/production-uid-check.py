# SPDX-License-Identifier: Apache-2.0
"""Trusted host prestart: reserved numeric web identity must be unused, no secrets."""
import grp,os,pathlib,pwd
assert os.geteuid()==0
for lookup in [pwd.getpwuid,grp.getgrgid]:
 try:lookup(61002)
 except KeyError:pass
 else:raise AssertionError('Web UID/GID is assigned to a host account; reconcile')
for path in pathlib.Path('/proc').glob('[0-9]*/status'):
 try:lines=path.read_text().splitlines()
 except FileNotFoundError:continue
 for line in lines:
  if line.startswith(('Uid:','Gid:','Groups:')):assert '61002' not in line.split()[1:], 'Web UID/GID already active; do not share credentials'
