import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
const approved=new Set(['MIT','Apache-2.0','BSD-2-Clause','BSD-3-Clause','ISC','0BSD','CC0-1.0','Unlicense','BlueOak-1.0.0'])
const reviewed=JSON.parse(await readFile('docs/license-selections.json','utf8'))
const packages=[]
for(const entry of await readdir('node_modules/.pnpm',{withFileTypes:true})){
 if(!entry.isDirectory() || entry.name==='node_modules')continue
 const base=`node_modules/.pnpm/${entry.name}/node_modules`
 for(const child of await readdir(base,{withFileTypes:true})){
  if(!child.isDirectory())continue
  const dirs=child.name.startsWith('@')?(await readdir(`${base}/${child.name}`,{withFileTypes:true})).filter(x=>x.isDirectory()).map(x=>`${base}/${child.name}/${x.name}`):[`${base}/${child.name}`]
  for(const dir of dirs){const p=JSON.parse(await readFile(`${dir}/package.json`,'utf8'));let license=p.license ?? 'UNKNOWN'; const selection=reviewed.find(x=>x.name===p.name&&x.version===p.version); if(selection){const actual=createHash('sha256').update(await readFile(`${dir}/${selection.file}`)).digest('hex');if(actual!==selection.sha256)throw Error(`License artifact changed: ${p.name}`);license=selection.selectedLicense} packages.push({name:p.name,version:p.version,license,scopedApproval:selection?.reviewApproved === true && selection.scope === "unmodified-build-tool-only"})}
 }
}
if(!packages.length)throw Error("No installed dependencies were inspected")
const failed=packages.filter(p=>!approved.has(p.license) && !p.scopedApproval)
console.log(JSON.stringify({checked:packages.length,licenses:[...new Set(packages.map(p=>p.license))],blocked:failed},null,2))
if(failed.length)process.exit(1)
