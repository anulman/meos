#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Assemble a source-only backup installer. No third-party binaries or installation."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import tempfile
import os


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    out = args.output.absolute()
    if out.exists():
        raise SystemExit('output must be new')
    with tempfile.TemporaryDirectory(prefix='.backup-package-', dir=out.parent) as temp:
        stage = Path(temp) / 'package'
        stage.mkdir(mode=0o700)
        for name in ['meos-backup.py', 'install-age.py', 'source-lock.json', 'config.example.json']:
            shutil.copyfile(root / name, stage / name)
        shutil.copyfile(root.parent.parent / 'LICENSE', stage / 'LICENSE')
        shutil.copyfile(root.parent.parent / 'docs/BACKUP-RECOVERY.md', stage / 'BACKUP-RECOVERY.md')
        files = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in stage.iterdir()}
        (stage / 'package-manifest.json').write_text(json.dumps({'schema': 2, 'status': 'source-only-not-installed',
            'platform': 'linux-amd64', 'pythonMinimum': '3.11', 'files': files}, indent=2) + '\n')
        os.rename(stage, out)
    print(json.dumps({'status': 'source-only-not-installed', 'output': str(out)}))

if __name__ == '__main__':
    main()
