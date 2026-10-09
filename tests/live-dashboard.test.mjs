import assert from 'node:assert/strict';
import test from 'node:test';
import { captionMessages } from '../src/lib/dashboard/live-data.ts';
const hospital={id:'A',name:'병원 A',phone:'+8220000001',eta_minutes:15,phase:'confirming',call_status:'in-progress',answered_at:'2026-10-09T00:00:00Z',transcript:[],result:null,delivery:{status:'waiting'},hangup_pending:false};
test('overlapping and late fragments keep independent speakers and exact whitespace',()=>{
  const messages=captionMessages({...hospital,transcript:[
    {id:'a1',speaker:'assistant',text:'예상 ',start_ms:100,end_ms:200},
    {id:'h1',speaker:'hospital',text:'네',start_ms:150,end_ms:250},
    {id:'a3',speaker:'assistant',text:' 분입니다.',start_ms:300,end_ms:400},
    {id:'a2',speaker:'assistant',text:'십오',start_ms:200,end_ms:300},
  ]});
  assert.deepEqual(messages.map(m=>[m.id,m.role,m.text]),[['a1','ai','예상 십오 분입니다.'],['h1','hospital','네']]);
});
test('hospital interruption separates the next AI turn even within 1.2 seconds, including overlapping tails',()=>{
  const fragments=[
    {id:'a1',speaker:'assistant',text:'이 환자 지금 출발하면',start_ms:28000,end_ms:28600},
    {id:'h1',speaker:'hospital',text:'네, ',start_ms:29200,end_ms:29800},
    {id:'a2',speaker:'assistant',text:'네, 그럼 ',start_ms:29800,end_ms:30000},
    {id:'h2',speaker:'hospital',text:'됩니다.',start_ms:29800,end_ms:30400},
    {id:'a3',speaker:'assistant',text:'수용 가능하다는 확답 맞습니까?',start_ms:30000,end_ms:35800},
  ];
  const expected=[['a1','ai','이 환자 지금 출발하면'],['h1','hospital','네, 됩니다.'],['a2','ai','네, 그럼 수용 가능하다는 확답 맞습니까?']];
  const render=(transcript)=>captionMessages({...hospital,transcript}).map(m=>[m.id,m.role,m.text]);
  assert.deepEqual(render(fragments),expected);
  // Hospital captions may arrive after the assistant has already resumed.
  assert.deepEqual(render([fragments[0],fragments[2],fragments[4],fragments[1],fragments[3]]),expected);
  assert.deepEqual(render(JSON.parse(JSON.stringify(fragments))),expected);
  // Streaming keeps the resumed answer in its own stable bubble.
  assert.deepEqual(render(fragments.slice(0,3)).map(m=>m[0]),['a1','h1','a2']);
});
test('AI interjection also separates hospital turns; pauses without another speaker still merge',()=>{
  const messages=captionMessages({...hospital,transcript:[
    {id:'h1',speaker:'hospital',text:'확인 ',start_ms:0,end_ms:200},
    {id:'h2',speaker:'hospital',text:'중입니다.',start_ms:400,end_ms:600},
    {id:'a1',speaker:'assistant',text:'네.',start_ms:700,end_ms:900},
    {id:'h3',speaker:'hospital',text:'수용 가능합니다.',start_ms:1000,end_ms:1200},
  ]});
  assert.deepEqual(messages.map(m=>[m.role,m.text]),[['hospital','확인 중입니다.'],['ai','네.'],['hospital','수용 가능합니다.']]);
});
