// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
test('preserved depot activates exact guest and additive migration while retaining old runtime/database; tamper and migration rewrites fail closed',()=>{
const result=spawnSync('/usr/bin/python3',['-c',`
import importlib.util,pathlib,tempfile,sys,os
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('depot',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
with tempfile.TemporaryDirectory() as temp:
 base=pathlib.Path(temp);old=base/'old';bundle=base/'bundle'
 for root,guest in [(old,b'old-loaded-guest'),(bundle,b'new-reviewed-calendar-guest')]:
  (root/'wasm').mkdir(parents=True);(root/'migrations/main').mkdir(parents=True)
  (root/'config.textproto').write_text('fixed config')
  (root/'wasm/meos.wasm').write_bytes(guest)
  (root/'migrations/main/U1__existing.sql').write_text('existing migration')
 (old/'data').mkdir();(old/'data/main.db').write_bytes(b'preserved-private-database')
 (bundle/'migrations/main/U2__additive.sql').write_text('new migration')
 before=m.inventory(old);expected=m.inventory(bundle)
 receipt=m.stage(old,bundle,expected,base/'rollback',os.getuid(),os.getgid())
 assert m.inventory(old)==expected and m.inventory(base/'rollback')==before
 assert (old/'data/main.db').read_bytes()==b'preserved-private-database'
 assert receipt['before']['wasm/meos.wasm']!=receipt['after']['wasm/meos.wasm']
 (bundle/'wasm/meos.wasm').write_bytes(b'tampered candidate')
 try:m.stage(old,bundle,expected,base/'bad-tamper',os.getuid(),os.getgid())
 except AssertionError:pass
 else:raise AssertionError('Tampered bundle accepted')
 assert not (base/'bad-tamper').exists() and m.inventory(old)==expected
 (bundle/'migrations/main/U1__existing.sql').write_text('rewritten history')
 try:m.stage(old,bundle,m.inventory(bundle),base/'bad-history',os.getuid(),os.getgid())
 except AssertionError:pass
 else:raise AssertionError('Migration rewrite accepted')
 assert not (base/'bad-history').exists() and m.inventory(old)==expected
 # Candidate image packaging includes additions, rejects rewrites/removals.
 source=base/'source';target=base/'image';source.mkdir();target.mkdir()
 for root in [source,target]:(root/'U1__existing.sql').write_text('one')
 (source/'U2__new.sql').write_text('two');m.package_migrations(source,target)
 assert (target/'U2__new.sql').read_text()=='two'
 (source/'U1__existing.sql').write_text('bad')
 try:m.package_migrations(source,target)
 except AssertionError:pass
 else:raise AssertionError('Image migration rewrite accepted')
 assert (target/'U1__existing.sql').read_text()=='one'
 (source/'U1__existing.sql').unlink()
 try:m.package_migrations(source,target)
 except AssertionError:pass
 else:raise AssertionError('Image migration removal accepted')
 (bundle/'wasm/meos.wasm').unlink();(bundle/'wasm/meos.wasm').symlink_to(old/'wasm/meos.wasm')
 try:m.inventory(bundle)
 except AssertionError:pass
 else:raise AssertionError('Symlink runtime accepted')
`,new URL('./calendar-depot-runtime.py',import.meta.url).pathname],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
});
