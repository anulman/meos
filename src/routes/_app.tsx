import {createFileRoute,Link,Outlet,useLocation} from '@tanstack/react-router'
import {QueryClientProvider} from '@tanstack/react-query'
import {queryClient} from '../lib/store'
import {FloatingAdd,ResourceProvider} from '../components'
import {SessionGate} from '../components/SessionGate'
import {PlanningProvider} from '../components/Planning'
import {establishDataSession} from '../lib/loading'
import * as stylex from '@stylexjs/stylex'
const styles=stylex.create({frame:{maxWidth:'760px',marginInline:'auto',padding:'24px 22px 140px'}})
// SPA's document is prerendered; identity and private state are strictly browser-owned.
export const Route=createFileRoute('/_app')({ssr:false,beforeLoad:()=>establishDataSession(),component:AuthenticatedLayout})
function AuthenticatedLayout(){const bootstrap=Route.useRouteContext();const location=useLocation();const isWeek=location.pathname==='/week';const showAdd=location.pathname==='/'||isWeek;return <QueryClientProvider client={queryClient}><SessionGate bootstrap={bootstrap}><PlanningProvider><ResourceProvider><div {...stylex.props(styles.frame)}><main id="main-content"><Outlet/></main><nav aria-label="Main navigation"><Link to="/" activeOptions={{exact:true}}>Today</Link><Link to="/week" search={{week:'this'}}>Week</Link><Link to="/settings">Settings</Link></nav></div>{showAdd&&<FloatingAdd kind={isWeek?'outcome':'task'}/>}</ResourceProvider></PlanningProvider></SessionGate></QueryClientProvider>}
