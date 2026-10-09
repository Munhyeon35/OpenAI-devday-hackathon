import assert from 'node:assert/strict';
import test from 'node:test';
import { captionMessages, toReception } from '../src/lib/dashboard/live-data.ts';
const hospital={id:'A',name:'병원 A',phone:'+8220000001',eta_minutes:15,phase:'confirming',call_status:'in-progress',answered_at:'2026-10-09T00:00:00Z',transcript:[],result:null,delivery:{status:'waiting'},hangup_pending:false};
const job={id:'dispatch-a',created_at:'2026-10-09T00:00:00Z',status:'running',mode:'live',patient:{name:'가상 환자',age:42,condition:'다리 부상',location:'가상 위치'},hospitals:[hospital]};
test('overlapping and late fragments keep independent speakers and exact whitespace',()=>{
  const messages=captionMessages({...hospital,transcript:[
    {id:'a1',speaker:'assistant',text:'예상 ',start_ms:100,end_ms:200},
    {id:'h1',speaker:'hospital',text:'네',start_ms:150,end_ms:250},
    {id:'a3',speaker:'assistant',text:' 분입니다.',start_ms:300,end_ms:400},
    {id:'a2',speaker:'assistant',text:'십오',start_ms:200,end_ms:300},
  ]});
  assert.deepEqual(messages.map(m=>[m.id,m.role,m.text]),[['a1','ai','예상 십오 분입니다.'],['h1','hospital','네']]);
});
test('parallel hospital snapshots stay separate; partial bubbles retain IDs on updates and reconnect',()=>{
  const a={...hospital,transcript:[{id:'A:1',speaker:'assistant',text:'환자 ',start_ms:0,end_ms:200}]};
  const b={...hospital,id:'B',transcript:[{id:'B:1',speaker:'hospital',text:'확인 중',start_ms:0,end_ms:200}]};
  const first=toReception({...job,hospitals:[a,b]},Date.parse(job.created_at));
  a.transcript.push({id:'A:2',speaker:'assistant',text:'안내입니다.',start_ms:200,end_ms:400});
  const updated=toReception({...job,hospitals:[a,b]},Date.parse(job.created_at));
  assert.equal(updated.hospitals[0].messages[0].id,first.hospitals[0].messages[0].id);
  assert.equal(updated.hospitals[0].messages[0].text,'환자 안내입니다.');
  assert.equal(updated.hospitals[1].messages[0].text,'확인 중');
  assert.deepEqual(updated,toReception(JSON.parse(JSON.stringify({...job,hospitals:[a,b]})),Date.parse(job.created_at)));
});
test('processing is not a live call or rejection; unknown is never acceptance or transport completion',()=>{
  const processing=toReception({...job,hospitals:[{...hospital,phase:'processing',voice_ended_at:'2026-10-09T00:00:10Z'}]},Date.parse('2026-10-09T00:10:00Z'));
  assert.equal(processing.hospitals[0].status,'processing');
  assert.equal(processing.hospitals[0].callSeconds,10);
  const done=toReception({...job,status:'completed',hospitals:[{...hospital,result:{availability:'unknown',reason:'확답 없음'}}]},Date.parse(job.created_at));
  assert.equal(done.hospitals[0].status,'unknown');
  assert.equal(done.statusLabel,'확인 완료');
});
