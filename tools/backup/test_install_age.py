# SPDX-License-Identifier: Apache-2.0
"""Offline lifecycle/denial proofs; run with the real source-built runtime in bwrap."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('installer', Path(__file__).with_name('install-age.py'))
i = importlib.util.module_from_spec(spec); spec.loader.exec_module(i)

class InstallTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir='/proof')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.out = self.root / 'runtime'
        self.source = Path('/age')
        self.pin = i.sha(self.source / 'age-admission.json')
        self.space = patch.object(i.shutil, 'disk_usage', return_value=shutil._ntuple_diskusage(100*1024**3, 0, 100*1024**3))
        self.space.start(); self.addCleanup(self.space.stop)
    def call(self, *args):
        with patch.object(sys, 'argv', ['install-age.py', '--output', str(self.out), *args]), contextlib.redirect_stdout(io.StringIO()) as output:
            i.main()
        return json.loads(output.getvalue())
    def reuse(self):
        return self.call('--reuse-from', str(self.source), '--admission-sha256', self.pin)
    def test_reuse_without_go_or_network_and_repeat_no_writes(self):
        sentinel = self.root / 'planning-state'; sentinel.write_text('preserve')
        with patch.object(i, 'build', side_effect=AssertionError('build called')):
            self.assertEqual(self.reuse()['status'], 'installed-not-activated')
            before = {p: (p.stat().st_mtime_ns, p.stat().st_ino) for p in self.root.rglob('*')}
            self.assertEqual(self.call()['status'], 'verified-unchanged')
            self.call('--check', '--admission-sha256', self.pin)
            self.assertEqual(before, {p: (p.stat().st_mtime_ns, p.stat().st_ino) for p in self.root.rglob('*')})
        self.assertEqual(sentinel.read_text(), 'preserve')
    def test_check_missing_creates_nothing(self):
        with self.assertRaises(FileNotFoundError): self.call('--check')
        self.assertEqual(list(self.root.iterdir()), [])
    def test_untrusted_reuse_hash_rejected(self):
        with self.assertRaisesRegex(RuntimeError, 'digest mismatch'):
            self.call('--reuse-from', str(self.source), '--admission-sha256', '0'*64)
        self.assertFalse(self.out.exists())
    def test_changed_binary_is_not_repaired_silently(self):
        self.reuse(); binary = self.out / 'age'; binary.chmod(0o755); binary.write_bytes(b'changed')
        with patch.object(i, 'build', side_effect=AssertionError('build called')):
            with self.assertRaisesRegex(RuntimeError, 'binary changed'): self.call()
        self.assertEqual(binary.read_bytes(), b'changed')
    def test_changed_receipt_rejected_with_external_anchor(self):
        self.reuse(); receipt = self.out / 'age-admission.json'; receipt.chmod(0o644)
        receipt.write_text(receipt.read_text() + ' ')
        with self.assertRaisesRegex(RuntimeError, 'digest mismatch'):
            self.call('--check', '--admission-sha256', self.pin)
    def test_symlink_binary_rejected(self):
        self.reuse(); binary = self.out / 'age'; binary.unlink(); binary.symlink_to('/age/age')
        with self.assertRaisesRegex(RuntimeError, 'unsafe'): self.call('--check')
    def test_failed_build_never_publishes_and_retry_preserves_other_state(self):
        sentinel = self.root / 'config'; sentinel.write_text('unchanged')
        def broken(candidate, *_):
            (candidate / 'age').write_text('partial'); raise RuntimeError('interrupted')
        with patch.object(i, 'build', side_effect=broken):
            with self.assertRaisesRegex(RuntimeError, 'interrupted'): self.call()
        self.assertFalse(self.out.exists())
        self.reuse()
        self.assertEqual(sentinel.read_text(), 'unchanged')
    def test_capacity_denied_before_build(self):
        with patch.object(i.shutil, 'disk_usage', return_value=shutil._ntuple_diskusage(1,0,1)), patch.object(i,'build') as build:
            with self.assertRaisesRegex(RuntimeError,'space'): self.call()
            build.assert_not_called()
        self.assertFalse(self.out.exists())
    def test_wrong_source_checksum_denied_before_compile(self):
        policy=json.loads((i.ROOT/'source-lock.json').read_text())
        self.out.mkdir()
        with patch.object(i.shutil,'which',return_value='/usr/bin/go'),patch.object(i,'run',return_value='{"Sum":"wrong"}') as run:
            with self.assertRaisesRegex(RuntimeError,'checksum'):i.build(self.out,self.root,policy)
            self.assertEqual(run.call_count,1)
        self.assertFalse((self.out/'age').exists())
    def test_unreviewed_license_denied_before_download(self):
        policy=json.loads((i.ROOT/'source-lock.json').read_text());policy['toolchainLicense']='unknown'
        self.out.mkdir()
        with patch.object(i.shutil,'which',return_value='/usr/bin/go'),patch.object(i,'run') as run:
            with self.assertRaisesRegex(RuntimeError,'license'):i.build(self.out,self.root,policy)
            run.assert_not_called()
    def test_destination_lock_denies_concurrent_install(self):
        with (self.root / '.runtime.install.lock').open('a') as lock:
            i.fcntl.flock(lock, i.fcntl.LOCK_EX | i.fcntl.LOCK_NB)
            with self.assertRaises(BlockingIOError): self.reuse()
        self.assertFalse(self.out.exists())

if __name__ == '__main__': unittest.main()
