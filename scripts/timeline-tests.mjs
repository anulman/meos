// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict'
import {timelineWithGaps,timelineDuration} from '../src/lib/timeline.ts'
const minute=60000
const event=(start,end)=>({instant:start*minute,...end===undefined?{}:{end:end*minute}})
const gaps=items=>timelineWithGaps(items).filter(e=>'gap' in e).map(e=>[e.gap.start/minute,e.gap.end/minute])
assert.deepEqual(gaps([event(0,30),event(60,90),event(150,180),event(241,250)]),[[30,60],[90,150],[180,241]])
assert.deepEqual(gaps([event(0,180),event(30,60),event(70,90),event(180,190),event(200,210)]),[[190,200]])
assert.deepEqual(gaps([event(0,180),event(30),event(70,90),event(150,160),event(200,210)]),[[180,200]])
assert.deepEqual(gaps([event(0),event(60,90),event(120,150)]),[[90,120]])
assert.deepEqual(gaps([event(0,NaN),event(60,30),event(100,120)]),[])
assert.deepEqual(gaps([event(0,30),event(480,510)]),[[30,480]])
assert.deepEqual(gaps([]),[])
assert.equal(timelineDuration(60*minute),'1 hr');assert.equal(timelineDuration(61*minute),'1 hr 1 min')
assert.equal(timelineDuration(450*minute),'7 hr 30 min')
console.log('PASS timeline interval union, nested unknown durations, contiguous events, overnight, empty, invalid ends and duration labels')
