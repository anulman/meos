import {createFileRoute} from '@tanstack/react-router'
import {Tasks} from '../components'
export const Route=createFileRoute('/week')({component:()=> <main><p className="eyebrow">A WIDER VIEW</p><h1>This week,<br/><em>at your pace.</em></h1><p className="intro">The same intentions, with a little perspective.</p><section><h2>This week’s seed tasks</h2><Tasks/></section><p className="muted">Weekly planning arrives in the next phase.</p></main>})
