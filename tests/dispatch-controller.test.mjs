import test from 'node:test';
import assert from 'node:assert/strict';
import { DispatchController } from '../src/lib/dashboard/dispatch-controller.ts';
import { callPatient, planCalls, projectHospital } from '../src/lib/dashboard/dispatch-adapter.ts';
import { createDraftCase, candidateHospitals } from '../src/lib/dashboard/patient-workflow.ts';
const clock='2026-10-09T00:00:00Z';
function fixture(count=2){
  const result={source:'국립중앙의료원',retrievedAt:clock,sourceRetrievedAt:{hospitals:clock,beds:null,procedures:null},distanceType:'road',totalNearby:count,totalMatched:count,warnings:[],
    candidates:Array.from({length:count},(_,i)=>({id:`h${i}`,name:`가상 병원 ${i}`,address:'가상 주소',emergencyPhone:`02-1234-${String(i).padStart(4,'0')}`,phone:null,
      latitude:37+i/100,longitude:127,distanceKm:i+1,roadRoute:{provider:'OSRM',distanceKm:i+1,durationSeconds:600+i*60,calculatedAt:clock},classification:null,acceptance:'unconfirmed',match:'needs_confirmation',checks:[],beds:{},bedUpdatedAt:null,bedDataFresh:false,procedureNotes:[]}))};
  const c=createDraftCase('008',[37.49,127],new Date(clock));
  c.patient={...c.patient,age:'25',gender:'여성',symptom:'가상 부상',consciousness:'명료',spo2:'97',ktas:'2',assessment:'현장 평가',evaluator:'전달하지 않을 구급대 식별자'};
  c.location='가상 위치';c.status='ready';c.hospitals=candidateHospitals(c.id,result);c.candidateSearch={...c.candidateSearch,status:'ready',result};return c;
}
function memory(){const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};}
function job(body,id='job-1') {return {id,mode:'demo',status:'running',created_at:clock,patient:body.patient,hospitals:body.hospitals.map((h,i)=>({...h,id:`${id}-${i}`,phase:'confirming',call_status:'in-progress',answered_at:clock,transcript:[],result:null,delivery:{status:'waiting'},hangup_pending:false}))};}

test('default browser fetch keeps its global receiver for hospital searches and call submissions',async(t)=>{
  const c=fixture(),requests=[];
  t.mock.method(globalThis,'fetch',async function(url,options){
    if(this!==globalThis)throw new TypeError('Illegal invocation');
    requests.push(url);
    return Response.json(url==='/api/hospitals/candidates'?c.candidateSearch.result:job(JSON.parse(options.body)));
  });
  const controller=new DispatchController([c]);
  await controller.searchHospitals(c.id,c.patient,c.candidateSearch.parameters);
  assert.equal(controller.state.cases[0].candidateSearch.status,'ready');
  controller.setMode('demo');
  await controller.startCalls(c.id,()=>true);
  assert.equal(controller.state.batches[0].jobId,'job-1');
  assert.ok(controller.state.cases[0].hospitals.every(h=>h.status==='calling'));
  assert.deepEqual(requests,['/api/hospitals/candidates','/api/dispatches']);
});

test('Pre-KTAS mapping sends only entered admission facts and requested care; no invented name, vitals or severity',()=>{
  const c=fixture();c.candidateSearch.parameters.beds=['hv29'];
  const p=callPatient(c);
  assert.equal(p.name,'성명 미제공');assert.equal(p.age,25);assert.equal(p.location,'가상 위치');
  assert.match(p.condition,/산소포화도 %: 97/);assert.match(p.condition,/현장 Pre-KTAS 단계: 2/);assert.match(p.condition,/응급실 음압격리/);
  assert.doesNotMatch(p.condition,/구급대 식별자|혈압|맥박/);
  assert.deepEqual(Object.keys(p).sort(),['age','condition','location','name']);
  assert.throws(()=>callPatient({...c,patient:{...c.patient,age:''}}),/나이/);
});
test('candidate phones and road ETAs create pairs; missing ETA and duplicate phones never dial',()=>{
  const c=fixture(5);c.hospitals[3].eta=null;c.hospitals[4].candidate.emergencyPhone=c.hospitals[0].candidate.emergencyPhone;
  const plan=planCalls(c,c.hospitals.map(h=>h.id),()=>crypto.randomUUID());
  assert.deepEqual(plan.batches.map(b=>b.targets.length),[2,1]);assert.equal(plan.skipped.length,2);
  assert.equal(plan.batches[0].body.hospitals[0].phone,'+82212340000');assert.equal(plan.batches[0].body.hospitals[0].eta_minutes,10);
});
test('bulk click posts in parallel, maps independent SSE chats onto original map IDs, and survives reconnect/reload without redial',async()=>{
  const c=fixture(4), posts=[],pending=[],storage=memory();let keys=0;
  const controller=new DispatchController([c],async(url,options)=>{assert.equal(url,'/api/dispatches');posts.push(options);return await new Promise(resolve=>pending.push(resolve));},()=>`key-${++keys}`);
  controller.restore(storage);controller.setMode('live');
  assert.equal(posts.length,0);
  await controller.startCalls('008',()=>false);assert.equal(posts.length,0);
  const started=controller.startCalls('008',message=>{assert.match(message,/실제 전화 발신/);return true;});
  await controller.startCalls('008',()=>true);assert.equal(posts.length,2); // Double click suppressed.
  const jobs=posts.map((p,i)=>job(JSON.parse(p.body),`job-${i}`));
  jobs[0].hospitals[0].transcript=[{id:'a1',speaker:'assistant',text:'이 환자 지금 출발하면',start_ms:100,end_ms:200},{id:'h1',speaker:'hospital',text:'됩니다',start_ms:300,end_ms:400},{id:'a2',speaker:'assistant',text:'확답 맞습니까?',start_ms:500,end_ms:600}];
  jobs[1].hospitals[0].transcript=[{id:'b1',speaker:'hospital',text:'다른 병원 답변',start_ms:100,end_ms:200}];
  controller.receive(jobs); // SSE beats the POST response.
  pending.forEach((resolve,i)=>resolve(Response.json(job(JSON.parse(posts[i].body),`job-${i}`))));await started;
  let shown=controller.state.cases[0];
  assert.deepEqual(shown.hospitals[0].position,c.hospitals[0].position);
  assert.equal(shown.hospitals[0].id,c.hospitals[0].id);
  assert.deepEqual(shown.hospitals[0].messages.map(m=>m.role),['ai','hospital']);
  assert.equal(controller.getStream(shown,shown.hospitals[0]).text,'확답 맞습니까?');
  assert.equal(controller.getStream(shown,shown.hospitals[2]).text,'다른 병원 답변');
  jobs[0].hospitals[0].result={availability:'accepted',reason:'숨겨야 할 내부 요약'};
  jobs[0].hospitals[0].voice_ended_at='2026-10-09T00:00:12Z';
  controller.receive([jobs[0]]);controller.receive([jobs[0]]);controller.tick(Date.parse(clock)+60000,1);
  shown=controller.state.cases[0];assert.equal(shown.hospitals[0].status,'available');assert.equal(shown.hospitals[0].note,'수용 가능');assert.equal(shown.hospitals[0].callSeconds,12);
  assert.equal(shown.hospitals[0].messages.length,3);assert.equal(posts.length,2);
  const restored=new DispatchController([fixture()],async()=>{throw Error('must not redial');});restored.restore(storage);restored.receive(jobs);
  assert.equal(restored.state.cases[0].hospitals[0].status,'available');
});
test('uncertain POST retries only on explicit click with the same key and frozen patient, including after reload',async()=>{
  const c=fixture(),storage=memory(),bodies=[],keys=[];let calls=0;
  const fetcher=async(url,options)=>{keys.push(options.headers['Idempotency-Key']);bodies.push(options.body);if(++calls===1)throw Error('lost response');return Response.json(job(JSON.parse(options.body)));};
  const first=new DispatchController([c],fetcher,()=> 'fixed-key');first.restore(storage);first.setMode('live');
  await first.startCalls('008',()=>true);assert.equal(first.state.cases[0].hospitals[0].status,'error');
  const second=new DispatchController([fixture()],fetcher);second.restore(storage);second.setMode('live');
  second.savePatient('008',{...c.patient,symptom:'수정한 증상'});
  await second.startCalls('008',()=>true,c.hospitals[0].id);
  assert.deepEqual(keys,['fixed-key','fixed-key']);assert.equal(bodies[0],bodies[1]);
});
test('projection never replaces hospital geography or interprets missing result as acceptance',()=>{
  const c=fixture(),call=job(planCalls(c,[c.hospitals[0].id],()=> 'k').batches[0].body).hospitals[0];
  assert.equal(projectHospital(c.hospitals[0],{...call,phase:'processing'},Date.parse(clock)).note,'통화 종료 · 결과 판정 중');
  assert.equal(projectHospital(c.hospitals[0],{...call,result:{availability:'rejected'}},Date.parse(clock)).status,'unavailable');
});
