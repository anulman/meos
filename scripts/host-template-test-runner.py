# SPDX-License-Identifier: Apache-2.0
"""Run shipped relay privilege/socket regressions in a credential-free sandbox.

Root launcher; no production units, sockets, credentials or network are exposed.
Only systemd transient test scope is created. No dependencies are installed.
"""
import configparser
import hashlib
import json
import os
import pathlib
import shlex
import socket
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]


def fixture():
    service = configparser.ConfigParser(interpolation=None)
    service.read('/source/deployment/meos-host-upstream.service.in')
    unit = service['Service']
    assert 'User' not in unit and 'Group' not in unit, 'Numeric NSS identity regression'
    command = shlex.split(unit['ExecStart'])
    proxy = command.index('/usr/lib/systemd/systemd-socket-proxyd')
    assert command[0] == '/usr/bin/setpriv'
    assert unit['NoNewPrivileges'] == 'yes'
    sock_config = configparser.ConfigParser(interpolation=None)
    sock_config.read('/source/deployment/meos-host-upstream.socket.in')
    mode = int(sock_config['Socket']['DirectoryMode'], 8)
    socket_mode = int(sock_config['Socket']['SocketMode'], 8)
    probe = '''import os,pathlib,socket,sys
assert os.getuid()==os.getgid()==61006 and os.getgroups()==[]
status=dict(line.split(':',1) for line in pathlib.Path('/proc/self/status').read_text().splitlines())
for key in ['CapEff','CapPrm','CapBnd','CapAmb']:
 assert int(status[key].strip(),16)==0,(key,status[key])
assert status['NoNewPrivs'].strip()=='1'
fd=os.open(sys.argv[1],os.O_RDONLY|os.O_DIRECTORY)
s=socket.socket(socket.AF_UNIX);s.settimeout(2)
s.connect('/proc/self/fd/'+str(fd)+'/backend.sock')
s.sendall(b'fixture');s.close();os.close(fd)
'''
    with tempfile.TemporaryDirectory(dir='/fixture') as temporary:
        directory = pathlib.Path(temporary)
        directory.chmod(0o777)  # Synthetic fixture setup only, before any probe.
        listener = socket.socket(socket.AF_UNIX)
        os.seteuid(61006)
        try:
            listener.bind(str(directory / 'backend.sock'))
            os.chmod(directory / 'backend.sock', socket_mode)
        finally:
            os.seteuid(0)
        directory.chmod(mode)
        listener.listen(); listener.settimeout(2)
        argv = command[:proxy] + ['/usr/bin/python3', '-c', probe, str(directory)]
        clean = {'PATH': '/usr/bin:/bin'}
        result = subprocess.run(argv, env=clean, capture_output=True, text=True, timeout=5)
        assert result.returncode == 0, result.stderr
        connection, _ = listener.accept()
        assert connection.recv(20) == b'fixture'; connection.close()
        # The original mode must fail specifically at the directory FD open.
        directory.chmod(0o711)
        denied = subprocess.run(argv, env=clean, capture_output=True, text=True, timeout=5)
        assert denied.returncode != 0 and 'PermissionError' in denied.stderr
        directory.chmod(mode)
        # A second unprivileged identity can open the directory, but not connect.
        unauthorized = list(argv)
        unauthorized[unauthorized.index('--reuid=61006')] = '--reuid=61008'
        unauthorized[unauthorized.index('--regid=61006')] = '--regid=61008'
        unauthorized[unauthorized.index(probe)] = 'import os,socket,sys\n' + probe[probe.index('fd=os.open'):]
        denied = subprocess.run(unauthorized, env=clean, capture_output=True, text=True, timeout=5)
        assert denied.returncode != 0 and 'PermissionError' in denied.stderr
        listener.close()
    print('PASS: numeric identity without NSS; zero capabilities/NoNewPrivs; directory-FD connection; 0711 denial; non-owner socket denial')


def main():
    assert os.geteuid() == 0
    if sys.argv[1:] == ['--fixture']:
        fixture(); return
    assert not sys.argv[1:]
    paths = [ROOT / 'deployment/meos-host-upstream.service.in',
             ROOT / 'deployment/meos-host-upstream.socket.in', pathlib.Path(__file__)]
    hashes = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
    # Apply the shipped sandbox properties, replacing only the live socket bind.
    # Preserve canonical property capitalization for systemd-run.
    canonical = configparser.ConfigParser(interpolation=None)
    canonical.optionxform = str; canonical.read(paths[0])
    props = dict(canonical['Service'])
    for key in ['ExecStart', 'Restart', 'RestartSec', 'BindReadOnlyPaths']:
        props.pop(key)
    props.update({'ProtectHome': 'tmpfs', 'TemporaryFileSystem': '/run /fixture:mode=0755',
                  'BindReadOnlyPaths': str(ROOT) + ':/source',
                  'WorkingDirectory': '/fixture', 'MemoryMax': '128M', 'TasksMax': '32'})
    cmd = ['systemd-run', '--wait', '--pipe', '--collect']
    cmd += [f'--property={key}={value}' for key, value in props.items()]
    cmd += ['/usr/bin/env', '-i', 'PATH=/usr/bin:/bin', 'PYTHONDONTWRITEBYTECODE=1',
            '/usr/bin/python3', '/source/scripts/host-template-test-runner.py', '--fixture']
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=45)
    assert hashes == {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
    print(result.stdout + result.stderr)
    print(json.dumps({'exitCode': result.returncode, 'sourceSHA256': hashes,
                      'scope': 'synthetic privilege/socket proof, not proxy lifecycle or live backend rebind'}))
    raise SystemExit(result.returncode)


if __name__ == '__main__':
    main()
