import {createFileRoute} from '@tanstack/react-router'
import {getConfig} from '../lib/config'
import {ResourceLists} from '../components'
export const Route=createFileRoute('/settings')({component:Settings})
function Settings(){return <><header className="page-heading"><div><p className="eyebrow">Your space</p><h1>Settings</h1></div></header><ResourceLists/><section className="settings-card"><h2>Routines</h2><p className="muted">Routine editing arrives with daily planning.</p></section><section className="settings-card"><h2>Preferences</h2><dl><dt>Timezone</dt><dd>{getConfig().timezone}</dd><dt>Storage</dt><dd>Memory only · resets on reload</dd></dl></section></>}
