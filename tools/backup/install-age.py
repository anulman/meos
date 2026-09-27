#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Build pinned age source or reuse an admitted installation. Never activate backups."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import stat
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent

def require(ok, message):
    if not ok:
        raise RuntimeError(message)

def sha(path):
    with open(path, 'rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def regular(path):
    info = path.lstat()
    require(stat.S_ISREG(info.st_mode) and not info.st_mode & 0o022, 'unsafe installed file')

def verify(directory, policy, expected=None):
    for folder in [directory / 'notices', directory, *directory.absolute().parents]:
        info = folder.lstat()
        require(stat.S_ISDIR(info.st_mode) and not info.st_mode & 0o022, 'unsafe runtime directory')
    receipt = directory / 'age-admission.json'
    regular(receipt)
    if expected:
        require(sha(receipt) == expected, 'admission digest mismatch')
    data = json.loads(receipt.read_text())
    require(data['schema'] == 1 and data['policySHA256'] == sha(ROOT / 'source-lock.json'), 'source policy mismatch')
    require(data['platform'] == 'linux-amd64', 'unsupported admission platform')
    expected_files = {'age', 'age-keygen', 'notices/go-LICENSE'} | {'notices/' + name.replace('/', '_') + '-LICENSE' for name in policy['modules']}
    require(set(data['files']) == expected_files, 'incomplete admission')
    for name, digest in data['files'].items():
        regular(directory / name)
        require(sha(directory / name) == digest, 'installed binary changed')
    require(data['source'] == policy['modules'] and data['toolchain'] == policy['toolchain'], 'source provenance mismatch')
    return data

def run(args, env, cwd):
    return subprocess.check_output(args, env=env, cwd=cwd, text=True, stderr=subprocess.PIPE)

def build(directory, workspace, policy):
    go = shutil.which('go')
    require(go is not None, 'Go launcher missing; install Go through supported host tools, then retry')
    # Do not inherit credentials, proxy overrides, compiler flags or Go user config.
    env = {'PATH': '/usr/local/go/bin:/usr/bin:/bin', 'HOME': str(workspace),
           'GOENV': 'off', 'GOWORK': 'off', 'GOTOOLCHAIN': policy['toolchain'],
           'GOPROXY': 'https://proxy.golang.org', 'GOSUMDB': 'sum.golang.org',
           'GOPATH': str(workspace / 'go'), 'GOCACHE': str(workspace / 'cache'),
           'GOBIN': str(directory), 'GOOS': 'linux', 'GOARCH': 'amd64', 'CGO_ENABLED': '0'}
    require(policy['toolchainLicense'] == 'BSD-3-Clause', 'unreviewed toolchain license')
    (directory / 'notices').mkdir(mode=0o755)
    for module, pin in policy['modules'].items():
        require(pin['license'] == 'BSD-3-Clause', 'unreviewed module license')
        result = json.loads(run([go, 'mod', 'download', '-json', module + '@' + pin['version']], env, workspace))
        require(result.get('Sum') == pin['sum'], 'module checksum mismatch: ' + module)
        license_file = Path(result['Dir']) / 'LICENSE'
        require(sha(license_file) == pin['licenseSHA256'], 'module license mismatch: ' + module)
        shutil.copyfile(license_file, directory / 'notices' / (module.replace('/', '_') + '-LICENSE'))
    goroot = Path(run([go, 'env', 'GOROOT'], env, workspace).strip())
    require(sha(goroot / 'LICENSE') == policy['toolchainLicenseSHA256'], 'Go license mismatch')
    shutil.copyfile(goroot / 'LICENSE', directory / 'notices/go-LICENSE')
    run([go, 'install', '-trimpath', 'filippo.io/age/cmd/age@' + policy['modules']['filippo.io/age']['version'],
         'filippo.io/age/cmd/age-keygen@' + policy['modules']['filippo.io/age']['version']], env, workspace)
    metadata = {}
    for name in ['age', 'age-keygen']:
        info = run([go, 'version', '-m', str(directory / name)], env, workspace)
        require(info.splitlines()[0].endswith(': ' + policy['toolchain']), 'unexpected compiler')
        modules = {}
        for line in info.splitlines()[1:]:
            fields = line.split()
            require(not fields or fields[0] != '=>', 'module replacement denied')
            if fields and fields[0] in ['mod', 'dep']:
                require(len(fields) == 4, 'missing module checksum')
                module, version, checksum = fields[1:]
                require(module in policy['modules'], 'unreviewed dependency: ' + module)
                pin = policy['modules'][module]
                require((version, checksum) == (pin['version'], pin['sum']), 'unreviewed module version')
                modules[module] = pin
        require('filippo.io/age' in modules, 'missing main module')
        metadata[name] = info.replace(str(directory), '<install>')
        (directory / name).chmod(0o555)
    data = {'schema': 1, 'platform': 'linux-amd64', 'policySHA256': sha(ROOT / 'source-lock.json'),
            'source': policy['modules'], 'toolchain': policy['toolchain'], 'buildInfo': metadata,
            'files': {str(file.relative_to(directory)): sha(file) for file in directory.rglob('*') if file.is_file()}}
    (directory / 'age-admission.json').write_text(json.dumps(data, indent=2, sort_keys=True) + '\n')
    (directory / 'age-admission.json').chmod(0o444)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path, help='new immutable runtime directory under a trusted parent')
    parser.add_argument('--check', action='store_true', help='read-only: no build, cache, lock or directory creation')
    parser.add_argument('--reuse-from', type=Path, help='copy a previously admitted runtime, without Go or network')
    parser.add_argument('--admission-sha256', help='independently trusted receipt digest; required for reuse')
    args = parser.parse_args()
    require(platform.system() == 'Linux' and platform.machine() == 'x86_64', 'qualified platform is Linux amd64')
    require(not args.reuse_from or args.admission_sha256, 'reuse needs an independently trusted receipt digest')
    policy = json.loads((ROOT / 'source-lock.json').read_text())
    output = args.output.absolute()
    require(not output.is_symlink(), 'symlink output denied')
    require(output.parent.is_dir(), 'create the trusted destination parent first')
    for path in [output.parent, *output.parent.parents]:
        info = path.lstat()
        require(stat.S_ISDIR(info.st_mode) and not info.st_mode & 0o022, 'unsafe destination parent')
    if output.exists() or args.check:
        verify(output, policy, args.admission_sha256)
        print(json.dumps({'status': 'verified-unchanged', 'admissionSHA256': sha(output / 'age-admission.json')}))
        return
    # Serialize only this destination. No application/planning resource is locked.
    with open(output.parent / ('.' + output.name + '.install.lock'), 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        require(not output.exists(), 'destination appeared; inspect then retry')
        need = (40 if args.reuse_from else 1200) * 1024**2
        require(shutil.disk_usage(output.parent).free >= 5 * 1024**3 + need, 'insufficient build space plus 5 GiB reserve')
        with tempfile.TemporaryDirectory(prefix='.' + output.name + '.build-', dir=output.parent) as temp:
            workspace = Path(temp)
            candidate = workspace / 'runtime'
            candidate.mkdir(mode=0o700)
            if args.reuse_from:
                admitted = verify(args.reuse_from, policy, args.admission_sha256)
                (candidate / 'notices').mkdir(mode=0o755)
                for name in [*admitted['files'], 'age-admission.json']:
                    shutil.copy2(args.reuse_from / name, candidate / name)
            else:
                build(candidate, workspace, policy)
            verify(candidate, policy, args.admission_sha256)
            # Publish all files together. Failed/interrupted staging is never selected.
            for file in candidate.rglob('*'):
                if not file.is_file():
                    continue
                with file.open('rb') as stream:
                    os.fsync(stream.fileno())
            fd = os.open(candidate, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(fd)
            finally:
                os.close(fd)
            os.rename(candidate, output)
            fd = os.open(output.parent, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(fd)
            finally:
                os.close(fd)
    print(json.dumps({'status': 'installed-not-activated', 'admissionSHA256': sha(output / 'age-admission.json')}))

if __name__ == '__main__':
    os.umask(0o077)
    try:
        main()
    except (RuntimeError, OSError, ValueError, KeyError, subprocess.CalledProcessError) as error:
        raise SystemExit('age installation failed: ' + (str(error) if not isinstance(error, subprocess.CalledProcessError) else 'Go build/download failed; destination was not published'))
