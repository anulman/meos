import {createFileRoute} from '@tanstack/react-router'
import {getConfig} from '../lib/config'
export const Route=createFileRoute('/settings')({component:()=> <main><p className="eyebrow">YOUR SPACE</p><h1>Simple by<br/><em>design.</em></h1><section><h2>About this demo</h2><p>Changes live only in this browser tab. Navigating keeps them; reloading starts fresh. Other tabs have their own data.</p><p>Timezone: <strong>{getConfig().timezone}</strong></p><p>No account, notifications, or saved data.</p></section></main>})
