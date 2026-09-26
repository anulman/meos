# SPDX-License-Identifier: Apache-2.0
"""Socket activation handoff, always AFTER trusted setpriv dropped root/capabilities."""
import json,os,pathlib,socket,stat
assert os.geteuid()==os.getegid()==61002 and os.getgroups() in [[],[61002]]
status=pathlib.Path('/proc/self/status').read_text()
assert all(int(line.split()[1],16)==0 for line in status.splitlines() if line.startswith(('CapEff:','CapPrm:','CapBnd:','CapAmb:')))
assert os.environ.get('LISTEN_FDS')=='1' and os.environ.get('LISTEN_PID')==str(os.getpid())
listener=socket.fromfd(3,socket.AF_INET,socket.SOCK_STREAM)
assert listener.getsockname()[0]=='127.0.0.1' and listener.getsockopt(socket.SOL_SOCKET,socket.SO_ACCEPTCONN)==1
listener.close()
assert stat.S_ISSOCK(os.fstat(3).st_mode)
assert not pathlib.Path('/run/docker.sock').exists() and not pathlib.Path('/var/run/docker.sock').exists()
assert not os.access('/var/lib',os.R_OK) and not pathlib.Path('/home/clawy').exists()
os.set_inheritable(3,True)
# exec preserves PID so LISTEN_PID remains genuine systemd ownership, not forged.
os.execve('/opt/node/bin/node',['node','/app/scripts/serve-real.mjs'],{'PATH':'/opt/node/bin:/usr/bin:/bin','HOME':'/tmp','LANG':'C.UTF-8','LISTEN_PID':str(os.getpid()),'LISTEN_FDS':'1'})
