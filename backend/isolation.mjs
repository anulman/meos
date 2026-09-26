// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto'

const allowed = new Set(['Apache-2.0','MIT','BSD-2-Clause','BSD-3-Clause','ISC','0BSD','BlueOak-1.0.0','CC0-1.0','Unlicense'])
const digest = /^sha256:[0-9a-f]{64}$/
export function deny(condition, message) { if (!condition) throw new Error(`Acceptance denied: ${message}`) }
export const sha256 = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`

/** Called with a repository-reviewed registry, never a candidate-supplied trust root. */
export function admitArtifact(image, registry, evidence) {
 deny(typeof image === 'string' && /^[a-z0-9./:_-]+@sha256:[0-9a-f]{64}$/.test(image), 'image must use an exact digest')
 const entry = registry.artifacts?.find(row => row.image === image)
 deny(entry && entry.version === '0.33.22' && entry.reviewStatus === 'approved', 'artifact not in reviewed registry')
 deny(entry.cliSourceReviewed === true, 'pinned CLI source review absent')
 deny(digest.test(entry.inventoryDigest) && sha256(evidence.inventory) === entry.inventoryDigest, 'inventory digest mismatch')
 deny(digest.test(entry.sourceDigest) && sha256(evidence.source) === entry.sourceDigest, 'retained source digest mismatch')
 deny(digest.test(entry.noticesDigest) && sha256(evidence.notices) === entry.noticesDigest, 'retained notices digest mismatch')
 const inventory = JSON.parse(evidence.inventory)
 deny(inventory.image === image && inventory.coverage === 'complete-runtime-and-linked-components', 'incomplete or mismatched inventory')
 deny(Array.isArray(inventory.components) && inventory.components.length > 0, 'empty inventory')
 for (const item of inventory.components) {
  deny(typeof item.name === 'string' && item.name && typeof item.version === 'string' && item.version && digest.test(item.artifactDigest), 'unidentified component')
  deny(allowed.has(item.selectedLicense) || (item.name === 'trailbase' && item.version === '0.33.22' && item.selectedLicense === 'OSL-3.0' && item.exception === 'Telegram41790'), `unapproved component license: ${item.name}`)
 }
 deny(Array.isArray(entry.command) && entry.command.length > 0 && entry.command.every(arg => typeof arg === 'string'), 'qualified command absent')
 deny(entry.dataPath === '/data', 'unexpected data path')
 return entry
}

/** No operator-controlled endpoint, existing volume, identity or network is allowed. */
export function validatePlan(plan) {
 deny(plan && plan.schema === 1 && plan.environment === 'acceptance', 'acceptance environment required')
 const permitted = new Set(['schema','environment','runId','image','syntheticOnly','network','credentials','endpoint','volume','identity'])
 deny(Object.keys(plan).every(key => permitted.has(key)), 'unknown plan field')
 deny(/^[0-9a-f]{32}$/.test(plan.runId), 'fresh run ID required')
 deny(plan.syntheticOnly === true, 'synthetic fixtures required')
 deny(plan.network === 'none', 'network must be none in the foundation harness')
 deny(plan.credentials === 'fresh-in-container', 'external credentials forbidden')
 deny(plan.endpoint === 'container-loopback', 'external or host endpoint forbidden')
 deny(plan.volume === 'fresh-managed', 'existing volumes/bind mounts forbidden')
 deny(plan.identity === 'fresh-synthetic', 'production or reused identity forbidden')
 return {name:`meos-acceptance-${plan.runId}`, volume:`meos-acceptance-${plan.runId}-data`}
}

export function createArgs(plan, entry) {
 const {name, volume} = validatePlan(plan)
 return ['create','--name',name,'--label',`meos.acceptance.run=${plan.runId}`,'--label','meos.environment=acceptance',
  '--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges',
  '--pids-limit','128','--memory','512m','--cpus','1','--restart','no','--pull','never',
  '--tmpfs','/tmp:rw,noexec,nosuid,size=67108864',
  '--mount',`type=volume,source=${volume},target=/data,volume-nocopy`,plan.image,...entry.command]
}

/** Runtime inspection is mandatory before start; intended CLI flags alone are not evidence. */
export function verifyRuntime(container, volume, plan, imageId) {
 const names = validatePlan(plan); const host = container.HostConfig
 deny(container.Image === imageId, 'runtime image changed')
 deny(container.Config?.Labels?.['meos.acceptance.run'] === plan.runId && container.Config?.Labels?.['meos.environment'] === 'acceptance', 'container identity mismatch')
 deny(host?.NetworkMode === 'none' && !host.Privileged && host.ReadonlyRootfs === true, 'runtime isolation mismatch')
 deny(!host.PidMode && !host.IpcMode?.startsWith('host') && !host.Devices?.length, 'host namespace/device sharing')
 deny(!host.PortBindings || Object.keys(host.PortBindings).length === 0, 'published ports forbidden')
 deny(!host.Binds?.length && !host.VolumesFrom?.length, 'host/external mounts forbidden')
 deny(host.CapDrop?.includes('ALL') && host.SecurityOpt?.includes('no-new-privileges'), 'privilege confinement absent')
 deny(volume.Name === names.volume && volume.Driver === 'local' && (!volume.Options || Object.keys(volume.Options).length === 0), 'volume driver/path override')
 deny(volume.Labels?.['meos.acceptance.run'] === plan.runId && volume.Labels?.['meos.environment'] === 'acceptance', 'volume identity mismatch')
 deny(container.Mounts?.every(mount => mount.Type !== 'tmpfs' || mount.Destination === '/tmp'), 'unexpected tmpfs')
 const mounts = container.Mounts?.filter(mount => mount.Type !== 'tmpfs')
 deny(mounts?.length === 1 && mounts[0].Type === 'volume' && mounts[0].Name === names.volume && mounts[0].Destination === '/data', 'unexpected runtime volume')
 deny(container.Config?.Env?.every(value => /^(?:PATH|LANG|LC_ALL|SSL_CERT_FILE|SSL_CERT_DIR)=/.test(value)), 'image embeds unreviewed environment configuration')
}
