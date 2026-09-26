# SPDX-License-Identifier: Apache-2.0
"""Copy exact qualified client/adapter plus independently reviewed helpers/runtime.
No builds, imports, execution, install or service changes. Admission is root0600.
"""
import argparse,hashlib,json,os,pathlib,shutil,stat
assert os.geteuid()==0
p=argparse.ArgumentParser();p.add_argument('--qualification',required=True);p.add_argument('--admission',required=True);p.add_argument('--output',required=True);a=p.parse_args()
REQUIRED_NODE_NOTICES=['deps/icu-small/LICENSE', 'deps/sqlite/sqlite3.c.header.txt', 'deps/sqlite/sqlite3.h.header.txt', 'deps/v8/LICENSE', 'deps/v8/LICENSE.fdlibm', 'deps/v8/LICENSE.strongtalk', 'deps/v8/LICENSE.v8', 'deps/v8/third_party/abseil-cpp/LICENSE', 'deps/v8/third_party/colorama/LICENSE', 'deps/v8/third_party/fp16/LICENSE', 'deps/v8/third_party/glibc/LICENSE', 'deps/v8/third_party/highway/LICENSE', 'deps/v8/third_party/inspector_protocol/LICENSE', 'deps/v8/third_party/jinja2/LICENSE.rst', 'deps/v8/third_party/jsoncpp/LICENSE', 'deps/v8/third_party/markupsafe/LICENSE', 'deps/v8/third_party/rapidhash-v8/LICENSE', 'deps/v8/third_party/re2/LICENSE', 'deps/v8/third_party/simdutf/LICENSE', 'deps/v8/third_party/siphash/LICENSE', 'deps/v8/third_party/utf8-decoder/LICENSE', 'deps/v8/third_party/v8/builtins/LICENSE', 'deps/v8/third_party/v8/codegen/LICENSE', 'deps/v8/third_party/valgrind/LICENSE', 'deps/v8/third_party/vtune/LICENSE', 'deps/v8/third_party/wasm-api/LICENSE', 'deps/v8/third_party/zlib/LICENSE']
repo=pathlib.Path(__file__).resolve().parents[1];node=pathlib.Path('/home/clawy/.local/share/mise/installs/node/24.19.0')
admission_path=pathlib.Path(a.admission).absolute();i=admission_path.lstat();assert stat.S_ISREG(i.st_mode) and i.st_uid==0 and stat.S_IMODE(i.st_mode)==0o600 and i.st_nlink==1
admission=json.loads(admission_path.read_text());assert admission['status'] in ['approved-for-release-staging','approved-for-isolated-staging'] and admission['reviewer'] and admission['reviewEvidence']
qualification_only=admission['status']=='approved-for-isolated-staging'
# Exact independently reviewed supplemental notice set is mandatory, including
# delegated V8 grants absent from aggregate Node LICENSE. Check before output.
assert set(admission['nodeSupplementalNoticeFiles'])==set(REQUIRED_NODE_NOTICES)
notice_source=repo/'.qualification/release-node-runtime-assessment/source/notices'
for relative,digest in admission['nodeSupplementalNoticeFiles'].items():
 source_notice=notice_source/relative
 assert source_notice.is_file() and not source_notice.is_symlink() and hashlib.sha256(source_notice.read_bytes()).hexdigest()==digest
qpath=pathlib.Path(a.qualification).absolute();raw=qpath.read_bytes();assert hashlib.sha256(raw).hexdigest()==admission['qualificationReceiptSHA256']
qualification=json.loads(raw);assert qualification['exitCode']==0 and qualification['mode']=='release'
assert qualification['accessBrowserEvidence']['count']==6 and qualification['accessBrowserEvidence']['runId']==qualification['runId']
assert qualification['browserEvidence']['count']==26 and qualification['productionPathEvidence']['count']==4
assert qualification['browserEvidence']['runId']==qualification['productionPathEvidence']['runId']==qualification['runId']
assert len(qualification['browserEvidence']['checks'])==26 and len(qualification['productionPathEvidence']['checks'])==4
assert qualification['clientFiles'] and qualification['clientArtifactDigest']==admission['clientArtifactDigest'] and qualification['sourceDigest']==admission['sourceDigest']
source=pathlib.Path(qualification['sandbox']);assert source.is_absolute() and not source.is_symlink()
out=pathlib.Path(a.output).absolute();assert not out.exists()
for parent in out.parents:
 i=parent.lstat();assert stat.S_ISDIR(i.st_mode) and i.st_uid==0 and not i.st_mode&0o022
out.mkdir(mode=0o755)
files={}
def copy(source,relative,digest):
 assert not pathlib.PurePosixPath(relative).is_absolute() and '..' not in pathlib.PurePosixPath(relative).parts
 assert source.is_file() and not source.is_symlink();data=source.read_bytes();assert hashlib.sha256(data).hexdigest()==digest
 target=out/relative;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data);os.chmod(target,0o555 if relative=='runtime/node/bin/node' else 0o444);files[relative]=digest
for relative,digest in qualification['clientFiles'].items():copy(source/'dist/client'/relative,'client/'+relative,digest)
closure=['access-owner','node-web-server','protected-proxy','body','domain','contract','timezones','scheduling','timezone-rules','calendar-routes','calendar-rpc','calendar-service','calendar-oauth','calendar-polling','calendar-events','calendar-snapshot-store','calendar-planner','calendar-planner-client','calendar-durable-store','calendar-google-broker','calendar-pinned-fetch']
for relative in ['backend/'+name+'.mjs' for name in closure]+['scripts/serve-real.mjs','scripts/serve-calendar.mjs']:
 copy(source/relative,relative,qualification['sourceFiles'][relative])
helpers=['production-ready.py','production-web-exec.py','production-uid-check.py','production-access-keys.py','calendar-uid-check.py']
assert set(admission['helperFiles'])=={'scripts/'+name for name in helpers}
for relative,digest in admission['helperFiles'].items():copy(repo/relative,relative,digest)
# The runtime binary and its full distributed notices need explicit independent
# license/artifact admission. Build-only Node approval is not runtime approval.
assert admission['licenseEvidence']
if qualification_only:assert admission['nodeRuntimeUse']=='qualification-only-existing-build-runtime'
else:assert admission['nodeRuntimeLicenseReview'] and admission['nodeRuntimeUse']=='production-runtime-explicitly-approved'
copy(node/'bin/node','runtime/node/bin/node',admission['nodeBinarySHA256'])
copy(node/'LICENSE','runtime/node/LICENSE',admission['nodeLicenseSHA256'])
for relative,digest in admission['nodeSupplementalNoticeFiles'].items():copy(notice_source/relative,'runtime/node/notices/'+relative,digest)
manifest={'status':'qualification-only' if qualification_only else 'independently-reviewed','runtimeUse':'isolated-test-only-no-production-admission' if qualification_only else 'production-reviewed','image':admission['image'],'sourceCommit':admission['sourceCommit'],'reviewEvidence':admission['reviewEvidence'],'licenseEvidence':admission['licenseEvidence'],'nodeRuntimeLicenseReview':None if qualification_only else admission['nodeRuntimeLicenseReview'],'qualificationReceiptSHA256':admission['qualificationReceiptSHA256'],'clientArtifactDigest':qualification['clientArtifactDigest'],'files':files}
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');os.chmod(out/'manifest.json',0o444)
for directory in out.rglob('*'):
 if directory.is_dir():os.chmod(directory,0o555)
os.chmod(out,0o555)
print(json.dumps({'status':'qualification-only-staged' if qualification_only else 'staged-not-deployed','release':str(out),'manifestSHA256':hashlib.sha256((out/'manifest.json').read_bytes()).hexdigest()}))
