# SPDX-License-Identifier: Apache-2.0
"""Render a NEW root-private Calendar runtime bundle; never install/start units.
Requires reviewed release containing service closure, exact existing owner policy,
and this installation's OAuth credentials supplied by Varlock run. No profile fallback.
"""
import argparse,hashlib,ipaddress,json,os,pathlib,re,socket,stat
from urllib.parse import urlsplit
assert os.geteuid()==0
p=argparse.ArgumentParser();p.add_argument('--release',required=True);p.add_argument('--access-config',required=True);p.add_argument('--output',required=True);p.add_argument('--planner-credentials',required=True);p.add_argument('--planner-socket',required=True);a=p.parse_args()
release=pathlib.Path(a.release).absolute();out=pathlib.Path(a.output).absolute()
def secure(path):
 i=path.lstat();assert stat.S_ISREG(i.st_mode) and i.st_uid==0 and not i.st_mode&0o022
 for parent in path.parents:
  info=parent.lstat();assert stat.S_ISDIR(info.st_mode) and info.st_uid==0 and not info.st_mode&0o022
secure(release/'manifest.json');manifest=json.loads((release/'manifest.json').read_text());assert manifest['status']=='independently-reviewed' and manifest['runtimeUse']=='production-reviewed'
required=['scripts/serve-calendar.mjs','backend/calendar-service.mjs','backend/calendar-oauth.mjs','backend/calendar-polling.mjs','backend/calendar-events.mjs','backend/calendar-snapshot-store.mjs','backend/calendar-planner.mjs','backend/calendar-planner-client.mjs','backend/node-web-server.mjs','backend/protected-proxy.mjs','backend/body.mjs','backend/domain.mjs','backend/contract.mjs','backend/scheduling.mjs','backend/timezones.mjs','backend/timezone-rules.mjs','backend/calendar-durable-store.mjs','backend/calendar-google-broker.mjs','backend/calendar-pinned-fetch.mjs','backend/calendar-rpc.mjs']
for name in required:
 secure(release/name);assert hashlib.sha256((release/name).read_bytes()).hexdigest()==manifest['files'][name]
access_path=pathlib.Path(a.access_config).absolute();secure(access_path);access=json.loads(access_path.read_text());assert re.fullmatch('[a-f0-9-]{36}',access['ownerId']) and re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',access['email'])
planner_path=pathlib.Path(a.planner_credentials).absolute();secure(planner_path);assert stat.S_IMODE(planner_path.stat().st_mode)==0o600
planner=json.loads(planner_path.read_text());assert planner['ownerId']==access['ownerId'] and planner['agentId']!=access['ownerId'] and set(planner['scopes'])=={'sync:read','sync:write'} and len(planner['password'])>=32
planner_socket=pathlib.Path(a.planner_socket).absolute();assert stat.S_ISSOCK(planner_socket.lstat().st_mode)
# Invoke under `varlock run --path <private-install-config>/ -- ...`.
# Never load the operator's shell profile or another installation's defaults.
credentials={key:os.environ.get(key,'') for key in ['MEOS_GOOGLE_CLIENT_ID','MEOS_GOOGLE_CLIENT_SECRET']}
origin=os.environ.get('MEOS_PUBLIC_ORIGIN','');url=urlsplit(origin)
assert url.scheme=='https' and url.netloc and not url.username and not url.password and not url.path and not url.query and not url.fragment and origin=='https://'+url.netloc
assert re.fullmatch(r'[-a-zA-Z0-9_.]+\.apps\.googleusercontent\.com',credentials['MEOS_GOOGLE_CLIENT_ID'])
assert 1<=len(credentials['MEOS_GOOGLE_CLIENT_SECRET'])<=4096
pins={host:sorted({item[4][0] for item in socket.getaddrinfo(host,443,socket.AF_INET,socket.SOCK_STREAM)}) for host in ['oauth2.googleapis.com','www.googleapis.com']}
assert all(ips and all(ipaddress.ip_address(ip).is_global for ip in ips) for ips in pins.values())
assert not out.exists() and out.parent.stat().st_uid==0 and not out.parent.stat().st_mode&0o022
out.mkdir(mode=0o700)
config={'origin':origin,'redirectUri':origin+'/api/calendar/google/callback','ownerId':access['ownerId'],'ownerEmail':access['email'],'googlePins':pins,'plannerEnabled':True}
for name,value in [('config.json',config),('oauth.json',{'clientId':credentials['MEOS_GOOGLE_CLIENT_ID'],'clientSecret':credentials['MEOS_GOOGLE_CLIENT_SECRET']}),('planner.json',planner)]:
 target=out/name;target.write_text(json.dumps(value));os.chown(target,0,61004);os.chmod(target,0o440)
repo=pathlib.Path(__file__).resolve().parents[1]
values={'RELEASE':str(release),'NODE_DIR':str(release/'runtime/node'),'CONFIG':str(out/'config.json'),'OAUTH':str(out/'oauth.json'),'PLANNER_BIND':f'BindReadOnlyPaths={planner_socket}:/run/meos-planner/backend.sock {out}/planner.json:/run/meos-calendar/planner.json','STATE':'/var/lib/meos-calendar','GOOGLE_ALLOW':'\n'.join('IPAddressAllow='+ip+'/32' for ips in pins.values() for ip in ips)}
for name in ['meos-calendar.service.in','meos-calendar.socket']:
 text=(repo/'deployment'/name).read_text()
 for key,value in values.items():text=text.replace('@'+key+'@',value)
 assert not re.search('@[A-Z_]+@',text)
 (out/name.removesuffix('.in')).write_text(text)
(out/'render-receipt.json').write_text(json.dumps({'status':'rendered-not-installed','release':str(release),'manifestSHA256':hashlib.sha256((release/'manifest.json').read_bytes()).hexdigest(),'productionStatePreserved':True,'googleHosts':list(pins)}))
print(json.dumps({'status':'rendered-not-installed','output':str(out)}))
