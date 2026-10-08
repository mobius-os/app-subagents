import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
import * as activity from '../delegationActivity.js'

// Run the actual owning poll effect, not a second implementation. The only
// transport is a created-at-ordered fixture list; no delegation tools or APIs.
function fixture({active=true}={}) {
  const source=readFileSync(new URL('../index.jsx',import.meta.url),'utf8')
  const start=source.lastIndexOf('  useEffect(() => {',source.indexOf('    async function pollRecent()'))
  const effect=source.slice(start,source.indexOf(' // eslint-disable-line',start))
  const server=Array.from({length:100},(_,i)=>({id:`old${i}`,status:i===0 && active?'running':'completed',physical_run_id:`run${i}`}))
  const recentRef={current:structuredClone(server)},calls=[],details=[],timers=new Set()
  let clock=0,cleanup
  const recentPoll={current:activity.createDelegationPollPlan?.({now:()=>clock})}
  recentPoll.current?.succeeded(activity.RECENT_LIST_LIMIT)
  const ctx={...activity,recentRef,recentPoll,token:'synthetic',expanded:'old60',
    get hasActiveRecent(){return recentRef.current.some(row=>activity.isActive(row.status))},
    useEffect(fn){cleanup=fn()},
    setRecent(rows){recentRef.current=rows},loadRunDetail:id=>details.push(id),
    window:{setInterval(fn){timers.add(fn);return fn},clearInterval(fn){timers.delete(fn)},mobius:{signal(){}}},
    document:{visibilityState:'visible',addEventListener(){},removeEventListener(){}},
    fetch:async url=>{const limit=Number(new URL(url,'https://fixture.invalid').searchParams.get('limit'));calls.push(limit);return {ok:true,json:async()=>({items:structuredClone(server.slice(0,limit))})}},
  }
  const mount=()=>runInNewContext(effect,ctx)
  mount()
  return {server,calls,details,recentRef,ctx,
    async tick(count=1){for(let i=0;i<count;i++){const was=ctx.hasActiveRecent;clock+=5000;for(const fn of [...timers])await fn();if(effect.includes('[token, hasActiveRecent, expanded]') && was!==ctx.hasActiveRecent){cleanup?.();mount()}}},
    stop(){cleanup?.()},
  }
}
test('an older completed helper follow-up is discovered outside the active window and its completion updates detail',async()=>{
  const f=fixture()
  try{
    f.server[60]={...f.server[60],status:'running',physical_run_id:'followup-60'}
    await f.tick(12)
    assert.equal(f.recentRef.current[60].status,'running','bounded full reconciliation discovers the old row')
    assert.ok(f.calls.slice(0,11).some(limit=>limit<activity.RECENT_LIST_LIMIT),'normal active polls remain small')
    f.server[0].status='completed';await f.tick()
    f.server[60].status='completed';await f.tick()
    assert.equal(f.recentRef.current[60].status,'completed')
    assert.ok(f.details.includes('old60'),'expanded follow-up completion refreshes detail')
    f.server[60]={...f.server[60],status:'running',physical_run_id:'second-followup'}
    await f.tick(12)
    assert.equal(f.recentRef.current[60].status,'running','discovery survives the last cached active row ending')
  }finally{f.stop()}
})
test('an entirely settled catalog still discovers a reused helper',async()=>{
  const f=fixture({active:false})
  try{f.server[60].status='running';await f.tick(12);assert.equal(f.recentRef.current[60].status,'running')}
  finally{f.stop()}
})
test('a follow-up completed between reconciliations refreshes the expanded result',async()=>{
  const f=fixture({active:false})
  try{f.server[60].physical_run_id='completed-followup';await f.tick(12);assert.ok(f.details.includes('old60'))}
  finally{f.stop()}
})
test('hidden polling performs no reads and an overdue reconciliation remains due',async()=>{
  const f=fixture()
  try{f.ctx.document.visibilityState='hidden';await f.tick(12);assert.equal(f.calls.length,0);f.ctx.document.visibilityState='visible';await f.tick();assert.equal(f.calls[0],activity.RECENT_LIST_LIMIT)}
  finally{f.stop()}
})

test('full reconciliation is due after the bound, is not acknowledged by a small poll, and retries until successful',()=>{
  let now=0
  const plan=activity.createDelegationPollPlan({now:()=>now})
  assert.equal(plan.limit([]),activity.RECENT_LIST_LIMIT)
  plan.succeeded(activity.RECENT_LIST_LIMIT)
  now=activity.FULL_RECONCILE_MS-1
  assert.equal(plan.limit([]),null,'settled periods perform no fast reads')
  assert.equal(plan.limit([{status:'running'}]),21)
  now=activity.FULL_RECONCILE_MS
  assert.equal(plan.limit([]),activity.RECENT_LIST_LIMIT)
  plan.succeeded(21)
  assert.equal(plan.limit([]),activity.RECENT_LIST_LIMIT,'failed/missing full response is still due')
  plan.succeeded(activity.RECENT_LIST_LIMIT)
  assert.equal(plan.limit([]),null)
})
test('new physical run identity invalidates detail even when its activity was missed',()=>{
  assert.equal(activity.runDetailChanged({status:'completed',physical_run_id:null},{status:'completed',physical_run_id:'new'}),true)
  assert.equal(activity.runDetailChanged({status:'completed',physical_run_id:'same'},{status:'completed',physical_run_id:'same'}),false)
})
