# SPDX-License-Identifier: Apache-2.0
"""Harmless systemd egress-denial proof, synthetic loopback peer, no credentials.
Does not install units or touch Calendar/production state. A runtime lifecycle proof
must separately exercise the rendered release before production admission.
"""
import json,os,pathlib,socket,subprocess,threading
assert os.geteuid()==0
assert '61004' not in subprocess.check_output(['/usr/bin/ps','-eo','uid='],env={'PATH':'/usr/bin:/bin'},text=True).split()
server=socket.socket();server.bind(('0.0.0.0',0));server.listen();port=server.getsockname()[1]
def serve():
 
 while True:
  try:client,_=server.accept()
  except OSError:return
  client.sendall(b'synthetic-calendar-peer');client.close()
thread=threading.Thread(target=serve,daemon=True);thread.start()
control=socket.create_connection(('127.0.0.2',port),timeout=2);assert control.recv(64)==b'synthetic-calendar-peer';control.close()
code='''import errno,json,os,pathlib,socket
assert os.getuid()==61004
assert not pathlib.Path('/home/clawy/.profile').exists()
assert not pathlib.Path('/var/run/docker.sock').exists()
assert not os.access('/var/lib',os.R_OK)
for address in ['127.0.0.2']:
 s=socket.socket();s.settimeout(2)
 try:s.connect((address,PORT));raise AssertionError('forbidden network reachable')
 except OSError as e:assert isinstance(e,TimeoutError) or e.errno in [errno.EPERM,errno.EACCES],repr(e)
 finally:s.close()
s=socket.create_connection(('127.0.0.1',PORT),timeout=2)
assert s.recv(64)==b'synthetic-calendar-peer';s.close()
print(json.dumps({'uid':61004,'defaultDenyVerified':True,'controlledDeniedPeerPositiveControl':True,'syntheticAllowedPeerVerified':True,'hostSecretsInaccessible':True}))
'''.replace('PORT',str(port))
properties={'IPAddressDeny':'any','IPAddressAllow':'127.0.0.1/32','ProtectHome':'tmpfs','ProtectSystem':'strict','PrivateTmp':'yes','NoNewPrivileges':'yes','CapabilityBoundingSet':'CAP_SETUID CAP_SETGID CAP_SETPCAP','ProtectProc':'invisible','ProcSubset':'pid','TemporaryFileSystem':'/run','InaccessiblePaths':'/mnt /var/lib /root','RestrictAddressFamilies':'AF_UNIX AF_INET'}
result=subprocess.run(['systemd-run','--quiet','--wait','--pipe','--collect']+[f'--property={k}={v}' for k,v in properties.items()]+['/usr/bin/setpriv','--reuid=61004','--regid=61004','--clear-groups','--bounding-set=-all','/usr/bin/env','-i','PATH=/usr/bin:/bin','/usr/bin/python3','-c',code],env={'PATH':'/usr/bin:/bin'},capture_output=True,text=True,timeout=15)
assert result.returncode==0,(result.returncode,result.stdout,result.stderr)
proof=json.loads(result.stdout);proof['scope']='systemd-enforcement-only-not-release-admission'
repo=pathlib.Path(__file__).resolve().parents[1];target=repo/'.qualification/calendar-isolation-proof.json';target.write_text(json.dumps(proof,indent=2)+'\n');os.chown(target,repo.stat().st_uid,repo.stat().st_gid)
print(json.dumps(proof))
