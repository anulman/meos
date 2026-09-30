// SPDX-License-Identifier: Apache-2.0
import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'

test('operator origin, issuer and owner validators admit other identities but deny trust-boundary substitution',()=>{
 const script=fileURLToPath(new URL('deployment_config.py',import.meta.url))
 const result=spawnSync('/usr/bin/python3',['-I','-B','-c',`
import importlib.util,sys
spec=importlib.util.spec_from_file_location('deployment_config',sys.argv[1]);config=importlib.util.module_from_spec(spec);spec.loader.exec_module(config)
for value in ['https://planner.second-owner.invalid','https://planner.third-owner.invalid']:
 assert config.origin(value)==value
for value in ['http://planner.invalid','https://planner.invalid/','https://planner.invalid:443','https://planner.invalid:9443','https://planner.invalid:0','https://user:pass@planner.invalid','https://planner.invalid/path','https://planner.invalid?next=foreign','https://planner.invalid#fragment','https://PLANNER.invalid','https://planner.invalid\\\\@evil.invalid','https://planner.invalid:99999']:
 try:config.origin(value)
 except (AssertionError,ValueError):pass
 else:raise AssertionError('Rejected origin accepted')
assert config.issuer('https://second-owner.cloudflareaccess.com')=='https://second-owner.cloudflareaccess.com'
for value in ['https://cloudflareaccess.com.attacker.invalid','https://second-owner.cloudflareaccess.com/path','http://second-owner.cloudflareaccess.com','https://127.0.0.1','https://user@second-owner.cloudflareaccess.com']:
 try:config.issuer(value)
 except AssertionError:pass
 else:raise AssertionError('Rejected issuer accepted')
assert config.email('second-owner@example.invalid')=='second-owner@example.invalid'
for value in [' leading@example.invalid','bad\\n@example.invalid','two@@example.invalid','missing-at']:
 try:config.email(value)
 except AssertionError:pass
 else:raise AssertionError('Rejected email accepted')
`,script],{encoding:'utf8',env:{PATH:'/usr/bin:/bin'}})
 assert.equal(result.status,0,result.stderr)
})
