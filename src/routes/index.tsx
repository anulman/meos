import {createFileRoute} from '@tanstack/react-router'
import {Tasks} from '../components'
export const Route=createFileRoute('/')({component:()=> <main><p className="eyebrow">YOUR DAILY CLEARING</p><h1>Make room for<br/><em>what matters.</em></h1><p className="intro">A few small things. A little forward motion.</p><section><h2>Today’s intentions</h2><Tasks/></section><aside><span className="eyebrow">A PROJECT IN SEASON</span><h2>A greener balcony</h2><p>Small beginnings, room to grow.</p></aside></main>})
