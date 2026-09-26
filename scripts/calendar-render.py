# SPDX-License-Identifier: Apache-2.0
"""Render a NEW root-private Calendar runtime bundle; never install/start units.
Requires reviewed release containing service closure, exact existing owner policy,
and dedicated OAuth web-client credentials parsed without executing the profile.
"""
import argparse,hashlib,ipaddress,json,os,pathlib,re,shlex,socket,stat
assert os.geteuid()==0
p=argparse.ArgumentParser();p.add_argument('--release',required=True);p.add_argument('--access-config',required=True);p.add_argument('--output',required=True);a=p.parse_args()
release=pathlib.Path(a.release).absolute();out=pathlib.Path(a.output).absolute()
def secure(path):
 i=path.lstat();assert stat.S_ISREG(i.st_mode) and i.st_uid==0 and not i.st_mode&0o022
 for parent in path.parents:
  info=parent.lstat();assert stat.S_ISDIR(info.st_mode) and info.st_uid==0 and not info.st_mode&0o022
secure(release/'manifest.json');manifest=json.loads((release/'manifest.json').read_text());assert manifest['status']=='independently-reviewed' and manifest['runtimeUse']=='production-reviewed'
required=['scripts/serve-calendar.mjs','backend/calendar-service.mjs','backend/calendar-oauth.mjs','backend/calendar-watch.mjs','backend/calendar-durable-store.mjs','backend/calendar-google-broker.mjs','backend/calendar-pinned-fetch.mjs','backend/calendar-rpc.mjs']
for name in required:
 secure(release/name);assert hashlib.sha256((release/name).read_bytes()).hexdigest()==manifest['files'][name]
access_path=pathlib.Path(a.access_config).absolute();secure(access_path);access=json.loads(access_path.read_text());assert re.fullmatch('[a-f0-9-]{36}',access['ownerId']) and access['email']=='anulman@gmail.com'
profile=pathlib.Path('/home/clawy/.profile');info=profile.lstat();assert stat.S_ISREG(info.st_mode) and info.st_uid==1000 and not info.st_mode&0o022
credentials={}
for line in profile.read_text().splitlines():
 if not re.match(r'^\s*(?:export\s+)?MEOS_GOOGLE_CLIENT_(?:ID|SECRET)=',line):continue
 parts=shlex.split(line,comments=True);parts=parts[1:] if parts[0]=='export' else parts;assert len(parts)==1
 key,value=parts[0].split('=',1);assert key not in credentials and value and not any(c in value for c in '$`\n\r\x00');credentials[key]=value
assert set(credentials)=={'MEOS_GOOGLE_CLIENT_ID','MEOS_GOOGLE_CLIENT_SECRET'}
assert re.fullmatch(r'[-a-zA-Z0-9_.]+\.apps\.googleusercontent\.com',credentials['MEOS_GOOGLE_CLIENT_ID'])
assert 1<=len(credentials['MEOS_GOOGLE_CLIENT_SECRET'])<=4096
pins={host:sorted({item[4][0] for item in socket.getaddrinfo(host,443,socket.AF_INET,socket.SOCK_STREAM)}) for host in ['oauth2.googleapis.com','www.googleapis.com']}
assert all(ips and all(ipaddress.ip_address(ip).is_global for ip in ips) for ips in pins.values())
assert not out.exists() and out.parent.stat().st_uid==0 and not out.parent.stat().st_mode&0o022
out.mkdir(mode=0o700)
config={'origin':'https://meos.aidans.computer','redirectUri':'https://meos.aidans.computer/api/calendar/google/callback','notificationUrl':'https://meos.aidans.computer/api/calendar/google/notifications','ownerId':access['ownerId'],'ownerEmail':access['email'],'googlePins':pins}
for name,value in [('config.json',config),('oauth.json',{'clientId':credentials['MEOS_GOOGLE_CLIENT_ID'],'clientSecret':credentials['MEOS_GOOGLE_CLIENT_SECRET']})]:
 target=out/name;target.write_text(json.dumps(value));os.chown(target,0,61004);os.chmod(target,0o440)
repo=pathlib.Path(__file__).resolve().parents[1]
values={'RELEASE':str(release),'NODE_DIR':str(release/'runtime/node'),'CONFIG':str(out/'config.json'),'OAUTH':str(out/'oauth.json'),'STATE':'/var/lib/meos-calendar','GOOGLE_ALLOW':'\n'.join('IPAddressAllow='+ip+'/32' for ips in pins.values() for ip in ips)}
for name in ['meos-calendar.service.in','meos-calendar.socket']:
 text=(repo/'deployment'/name).read_text()
 for key,value in values.items():text=text.replace('@'+key+'@',value)
 assert not re.search('@[A-Z_]+@',text)
 (out/name.removesuffix('.in')).write_text(text)
(out/'render-receipt.json').write_text(json.dumps({'status':'rendered-not-installed','release':str(release),'manifestSHA256':hashlib.sha256((release/'manifest.json').read_bytes()).hexdigest(),'productionStatePreserved':True,'googleHosts':list(pins)}))
print(json.dumps({'status':'rendered-not-installed','output':str(out)}))
