import {createFileRoute} from '@tanstack/react-router'
import {getConfig} from '../lib/config'
export const Route=createFileRoute('/settings')({component:Settings})
function Settings(){return <><header className="page-heading"><div><p className="eyebrow">Your space</p><h1>Settings</h1></div></header><section className="settings-card"><h2>Preferences</h2><dl><dt>Timezone</dt><dd>{getConfig().timezone}</dd><dt>Storage</dt><dd>Memory only · resets on reload</dd></dl></section><section className="settings-card"><h2>Projects & routines</h2><p>The project, routine and unassigned-task lists will arrive as their editing flows are built.</p></section><p className="preview-note">Phase 2 · visual shell preview. You can complete demo tasks on Today or Week.</p></>}
