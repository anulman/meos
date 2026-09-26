# SPDX-License-Identifier: Apache-2.0
# Private qualification archives only; not a consumer binary-release publisher.
# Run inside an isolated builder (CI or trusted host launcher), never with prod credentials.
import pathlib,subprocess,json,hashlib,os,tarfile,io,sys
root=pathlib.Path(__file__).resolve().parents[1];client=root/'clients/meos-agent';pin=json.loads((client/'toolchain.json').read_text());go=os.environ.get('MEOS_GO','go')
clean={'PATH':os.environ.get('PATH','/usr/bin:/bin'),'HOME':os.environ.get('HOME','/tmp'),'GOCACHE':os.environ.get('GOCACHE','/tmp/go-cache'),'GOPATH':'/tmp/go-path','GOTOOLCHAIN':'local','GOPROXY':'off','GOSUMDB':'off','CGO_ENABLED':'0','GOMAXPROCS':'2','GOEXPERIMENT':''}
def run(args,**kw):return subprocess.check_output([go,*args],cwd=client,env=clean,**kw)
assert run(['env','GOVERSION'],text=True).strip()==pin['version'],'Exact pinned compiler required'
goroot=pathlib.Path(run(['env','GOROOT'],text=True).strip())
for name,digest in pin['licenses'].items():assert hashlib.sha256((goroot/name).read_bytes()).hexdigest()==digest,'Unreviewed toolchain license'
assert run(['list','-m','all'],text=True).strip()=='github.com/anulman/meos/clients/meos-agent','Dependencies require explicit review'
deps=run(['list','-deps','-f','{{if not .Standard}}{{.ImportPath}}{{end}}','.'],text=True).split();assert deps==['github.com/anulman/meos/clients/meos-agent'],'Non-stdlib dependency blocked'
assert sys.argv[1:] in ([], ['--check-only']), 'Unsupported arguments'
if sys.argv[1:] == ['--check-only']:
 print('Dependency and toolchain license checks passed; source-only distribution')
 raise SystemExit(0)
version=os.environ.get('MEOS_VERSION','development');assert all(c.isalnum() or c in '.-_' for c in version) and 1<=len(version)<=100
out=pathlib.Path(os.environ.get('MEOS_OUTPUT',str(root/'dist/agent-client')));out.mkdir(parents=True,exist_ok=True);artifacts={}
for system in ['linux','darwin']:
 for arch in ['amd64','arm64']:
  name=f'meos-agent-{version}-{system}-{arch}';binary=out/name
  env={**clean,'GOOS':system,'GOARCH':arch}
  subprocess.run([go,'build','-trimpath','-buildvcs=false','-ldflags=-s -w -X main.version='+version,'-o',str(binary),'.'],cwd=client,env=env,check=True)
  package=out/(name+'.tar.gz')
  files=[(binary,'meos-agent'),(root/'LICENSE','LICENSE'),(client/'README.md','README.md')]+[(goroot/name,'notices/'+name.replace('/','__')+'.txt') for name in sorted(pin['licenses'])]+[(goroot/'PATENTS','notices/Go-PATENTS.txt')]+[(p,'service/'+p.name) for p in sorted((client/'service').glob('*'))]
  # gzip header timestamp pinned too, so same compiler/source produces same archive.
  import gzip
  with package.open('wb') as target,gzip.GzipFile(filename='',mode='wb',fileobj=target,mtime=0) as compressed,tarfile.open(fileobj=compressed,mode='w') as archive:
   for p,relative in files:
    data=p.read_bytes();info=tarfile.TarInfo(relative);info.size=len(data);info.mode=0o755 if relative=='meos-agent' else 0o644;info.mtime=0;archive.addfile(info,io.BytesIO(data))
  artifacts[package.name]=hashlib.sha256(package.read_bytes()).hexdigest();binary.unlink()
(out/'SHA256SUMS').write_text(''.join(d+'  '+n+'\n' for n,d in sorted(artifacts.items())))
(out/'manifest.json').write_text(json.dumps({'version':version,'goVersion':pin['version'],'CGO_ENABLED':False,'dependencies':'Go standard library only','archives':artifacts,'sourceFiles':{str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(client.rglob('*')) if p.is_file()}},indent=2)+'\n')
print(json.dumps(artifacts,indent=2))
