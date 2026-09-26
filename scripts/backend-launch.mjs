// SPDX-License-Identifier: Apache-2.0
import { readFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { admitArtifact, createArgs, deny, validatePlan, verifyRuntime } from '../backend/isolation.mjs'

const root = new URL('../backend/', import.meta.url)
const image = process.argv[2]
const prepareRestore=process.argv[3]==='--prepare-restore'
deny(process.argv.length===(prepareRestore?4:3),'unexpected launcher arguments')
const registry = JSON.parse(await readFile(new URL('reviewed-artifacts.json', root), 'utf8'))
// Registry selection occurs before evidence or Docker access. A candidate cannot admit itself.
const selected = registry.artifacts.find(entry => entry.image === image)
deny(selected, 'image absent from reviewed registry; no server will be executed')
const evidence = {}
for (const key of ['inventory','source','notices']) {
 const path = selected[`${key}File`]
 deny(typeof path === 'string' && /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9.]+$/.test(path), 'evidence must be a retained local basename')
 evidence[key] = await readFile(new URL(path, root))
}
const entry = admitArtifact(image, registry, evidence)
const plan = {schema:1,environment:'acceptance',runId:randomBytes(16).toString('hex'),image,syntheticOnly:true,network:'none',credentials:'fresh-in-container',endpoint:'container-unix-socket',volume:'fresh-managed',identity:'fresh-synthetic'}
const names = validatePlan(plan)
function docker(args, optional = false) {
 // No production env/DOCKER_HOST/context or credentials forwarded. Local Unix daemon only.
 const result = spawnSync('/usr/bin/docker',['--host','unix:///var/run/docker.sock',...args],{encoding:'utf8',env:{PATH:'/usr/bin:/bin'},timeout:30000,maxBuffer:1024*1024})
 if (result.error || result.status !== 0) { if (optional) return undefined; throw Error(`Docker operation failed: ${args[0]} (no retry; inspect acceptance resources ${names.name})`) }
 return result.stdout.trim()
}
// Successful absence checks distinguish not-found from an unavailable daemon.
docker(['info','--format','{{.ServerVersion}}'])
const containers = docker(['container','ls','-a','--format','{{.Names}}']).split('\n')
const volumes = docker(['volume','ls','--format','{{.Name}}']).split('\n')
deny(!containers.includes(names.name) && !volumes.includes(names.volume), 'run resource already exists')
const imageInfo = JSON.parse(docker(['image','inspect',image]))[0]
deny(image.startsWith('sha256:')?imageInfo.Id===image:imageInfo.RepoDigests?.includes(image), 'locally cached image digest mismatch')
deny(!imageInfo.Config?.Volumes || Object.keys(imageInfo.Config.Volumes).every(path => path === '/data'), 'image declares unexpected volumes')
docker(['volume','create','--driver','local','--label',`meos.acceptance.run=${plan.runId}`,'--label','meos.environment=acceptance',names.volume])
docker(createArgs(plan, entry))
const container = JSON.parse(docker(['container','inspect',names.name]))[0]
const volume = JSON.parse(docker(['volume','inspect',names.volume]))[0]
verifyRuntime(container, volume, plan, imageInfo.Id)
if(prepareRestore) {
 console.log(JSON.stringify({state:'prepared-for-disposable-restore',plan,containerId:container.Id,volume:names.volume,network:'none'},null,2))
 process.exit(0)
}
docker(['start',names.name])
const started = JSON.parse(docker(['container','inspect',names.name]))[0]
deny(started.State?.Running === true, 'container did not stay running')
verifyRuntime(started, volume, plan, imageInfo.Id)
console.log(JSON.stringify({state:'started',plan,containerId:started.Id,volume:names.volume,network:'none',identityQualified:false,note:'Only process isolation verified at start; continued liveness, auth/data and browser acceptance remain pending'},null,2))
