'use strict';
const $ = id => document.getElementById(id);
const names = ['내 전화', 'Twilio', '내 서버', 'GPT API'];
const xs = [120,355,660,1000];
const stages = [
  {name:'발신',phase:'내 서버가 전화를 요청',type:'data',route:[2,1,0],packet:'발신 요청',speaker:'내 서버',kind:'통화 시작',quote:'“입력한 번호로 전화를 걸어주세요.”',explanation:'환자 정보와 전화번호를 입력하면 서버가 Twilio API에 발신을 요청합니다. Twilio가 내 전화에 벨을 울립니다.',title:'먼저 서버 → Twilio',body:'발신 요청에 전화번호와 통화 연결용 콜백 주소를 담습니다. 실제 음성 연결은 상대방이 전화를 받은 뒤 시작합니다.',event:'POST Twilio Calls API → ringing'},
  {name:'연결',phase:'전화를 받으면 음성 통로를 연결',type:'data',route:[1,2,3],packet:'음성 세션 연결',speaker:'Twilio → 내 서버',kind:'양방향 통로',quote:'“전화가 연결됐어요. 음성을 어디로 보낼까요?”',explanation:'Twilio가 공개 HTTPS 주소로 연결 지침을 받습니다. 이어 내 서버에 음성 스트림을 열고, 서버는 이 통화 전용 GPT-Live 세션을 만듭니다.',title:'공개 주소가 필요한 순간',body:'Twilio는 내 컴퓨터의 localhost에 바로 접속할 수 없습니다. 공개 터널이 Twilio의 HTTPS 요청과 WSS 음성 연결을 localhost:8000까지 전달합니다.',event:'TwiML <Connect><Stream> → /twilio/media → session.start'},
  {name:'AI 질문',phase:'GPT가 만든 음성이 내 전화로',type:'ai',route:[3,2,1,0],packet:'AI 음성 조각',speaker:'GPT → 내 전화',kind:'AI 질문',quote:'“AI 이송 지원 도우미입니다. 응급실 수용 확인 담당자이신가요?”',explanation:'GPT가 생성한 한국어 음성을 서버가 Twilio로 전달합니다. Twilio가 전화망으로 재생하므로 내 전화에서 목소리가 들립니다.',title:'질문이 들리는 경로',body:'GPT는 오디오 데이터를 내보냅니다. 서버가 이 데이터를 Twilio Media Streams 형식에 담아 전달합니다. Twilio는 전달받은 음성을 전화로 재생합니다.',event:'session.output_audio.delta → Twilio media → 전화 스피커'},
  {name:'내 답변',phase:'내 목소리가 GPT에 도착',type:'human',route:[0,1,2,3],packet:'내 음성 조각',speaker:'내 전화 → GPT',kind:'내 답변',quote:'“네, 제가 담당자입니다. 말씀하세요.”',explanation:'전화 마이크가 내 목소리를 받습니다. Twilio가 음성을 작은 데이터 조각으로 보내고, 내 서버가 GPT-Live에 계속 전달합니다.',title:'말이 끝나기 전부터 전달',body:'현재 구현은 PCMU 8 kHz 전화 오디오를 사용합니다. GPT-Live에 오디오를 계속 보냅니다. 내가 끼어들면 서버가 AI 재생 큐와 Twilio 버퍼를 즉시 비우고 듣습니다. 전사는 별도로 수신합니다.',event:'Twilio media.payload → session.input_audio.append'},
  {name:'환자 안내',phase:'환자 정보와 도착 예정 시간을 질문에 담기',type:'ai',route:[3,2,1,0],packet:'환자 안내 음성',speaker:'GPT → 내 전화',kind:'AI 질문',quote:'“42세, 다리 부상 환자이며 15분 후 도착 예정입니다. 이 환자를 수용할 수 있나요?”',explanation:'GPT는 서버가 처음 전달한 환자 상태·위치·예상 도착시간을 바탕으로 질문합니다. 생성된 목소리는 다시 서버와 Twilio를 거쳐 내 전화로 옵니다.',title:'환자 정보는 서버가 제공',body:'통화별 세션을 시작할 때 환자 정보와 해당 병원의 예상 소요시간을 GPT에 전달합니다. 도착 예정 시간은 입력한 값이며, GPT가 임의로 계산하지 않습니다.',event:'환자 컨텍스트 → GPT 음성 생성 → 내 서버 → Twilio'},
  {name:'수용 답변',phase:'수용 여부에 대한 내 답변을 전달',type:'human',route:[0,1,2,3],packet:'수용 답변 음성',speaker:'내 전화 → GPT',kind:'내 답변',quote:'“네, 해당 환자를 받을 병상과 진료 여력이 있습니다.”',explanation:'이 답변 역시 음성 데이터로 동일한 경로를 이동합니다. GPT는 앞서 전달한 환자 정보와 연결해 답변을 이해합니다.',title:'음성과 대화 문맥을 함께 이해',body:'GPT-Live는 진행 중인 같은 통화의 문맥을 유지합니다. 내 서버는 이 병원에서 받은 전사도 기록하여 나중에 결과의 발언 근거를 검증합니다.',event:'전화 → Twilio → 서버 → GPT / 입력 전사도 수신'},
  {name:'재확인',phase:'단순 빈 병상 여부가 아닌 환자 수용을 확인',type:'ai',route:[3,2,1,0],packet:'재확인 질문',speaker:'GPT → 내 전화',kind:'AI 재질문',quote:'“말씀드린 환자를 15분 후 수용 가능하다는 확답이 맞습니까?”',explanation:'AI가 이해한 내용을 다시 읽어 확인합니다. 애매한 답변이나 조건부 답변을 확정된 수용 결과로 취급하지 않도록 하는 단계입니다.',title:'환자와 도착 시점까지 다시 확인',body:'병상이 있다는 말만으로 수용을 확정하지 않습니다. 해당 환자와 예상 도착 시점에 대한 명확한 답변을 받도록 프롬프트에 지정되어 있습니다.',event:'재확인 질문 생성 → session.output_audio.delta'},
  {name:'최종 확답',phase:'내 최종 답변이 GPT에 전달',type:'human',route:[0,1,2,3],packet:'최종 확답 음성',speaker:'내 전화 → GPT',kind:'내 확답',quote:'“네, 맞습니다. 그 환자 수용 가능합니다.”',explanation:'이 최종 답변이 GPT에 도착합니다. 이제 음성 대화를 바탕으로 수용 여부를 정리하고 서버에 기록하는 절차로 넘어갑니다.',title:'확답도 오디오로 전달',body:'전달 방식은 앞선 답변과 같습니다. GPT는 원래 질문, 환자 정보, 재확인 과정과 최종 응답을 함께 고려하여 결과 기록을 요청합니다.',event:'session.input_audio.append → 결과 해석 요청'},
  {name:'종료 후 저장',phase:'전화를 먼저 끊고 결과를 정리',type:'data',route:[3,2],packet:'수용 결과 JSON',speaker:'GPT API → 내 서버',kind:'구조화된 결과',quote:'“수용 가능 · 확답과 환자 정보 확인 완료”',explanation:'짧은 감사 인사 후 전화를 먼저 끊습니다. 그 뒤 서버가 결과 해석 모델을 호출해 확답을 검증하고 저장합니다. 상대는 저장이나 전송을 기다릴 필요가 없습니다.',title:'판단 요청과 저장은 별도 단계',body:'종료된 통화의 전사로 Responses API가 JSON 결과를 만듭니다. 서버가 확인 항목과 실제 병원 발언 인용을 검증하고 SQLite에 저장합니다. 외부 백엔드 전송과 재시도도 통화 후 실행합니다.',event:'통화 종료 → Responses API → SQLite → 백엔드 전송'}
];
let index=0, elapsed=0, playing=false, last=0;
const duration=8500;
stages.forEach((s,i)=>{const b=document.createElement('button');b.type='button';const n=document.createElement('span');n.textContent=String(i+1).padStart(2,'0');b.append(n,document.createTextNode(s.name));b.addEventListener('click',()=>go(i));$('steps').append(b);});
function render(){
  const s=stages[index];
  $('step-count').textContent=`${String(index+1).padStart(2,'0')} / 09`;
  $('phase-label').textContent=s.phase;
  $('diagram').setAttribute('class',s.type);
  $('packet').setAttribute('class',`packet ${s.type}`);
  $('packet-label').textContent=s.packet;
  $('speaker-dot').className=`speaker-dot ${s.type}`;
  for(const [id,key] of [['speaker','speaker'],['kind','kind'],['quote','quote'],['explanation','explanation'],['technical-title','title'],['technical-body','body'],['event','event']]) $(id).textContent=s[key];
  $('saved').hidden=index!==stages.length-1;
  $('route').replaceChildren();s.route.forEach((n,i)=>{if(i){const arrow=document.createElement('i');arrow.textContent='→';$('route').append(arrow);}const label=document.createElement('b');label.textContent=names[n];$('route').append(label);});
  [...$('steps').children].forEach((b,i)=>{if(i===index)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});
  $('prev').disabled=index===0;$('next').disabled=index===stages.length-1;
  updatePlay();draw();
}
function updatePlay(){$('play').textContent=playing?'Ⅱ 일시정지':index===8&&elapsed>=duration?'↺ 다시 재생':'▶ 재생';$('play').setAttribute('aria-label',playing?'애니메이션 일시정지':'애니메이션 재생');}
function go(i){index=Math.max(0,Math.min(stages.length-1,i));elapsed=0;render();}
function draw(){
 const s=stages[index];const cycle=(elapsed%3400)/3400;const position=cycle*(s.route.length-1);const segment=Math.min(s.route.length-2,Math.floor(position));const a=s.route[segment],b=s.route[segment+1];const fraction=position-segment;
 const x=xs[a]+(xs[b]-xs[a])*fraction;const y=s.type==='ai'?305:94;
 $('packet').setAttribute('transform',`translate(${x} ${y})`);
 $('packet-arrow').setAttribute('transform',xs[b]>xs[a]?'scale(1 1)':'scale(-1 1)');
 for(let n=0;n<4;n++)$('node-'+n).classList.toggle('active',n===(fraction<.5?a:b));
 $('progress').style.width=`${Math.min(100,(index+elapsed/duration)/stages.length*100)}%`;
}
function tick(time){const dt=last?Math.min(time-last,100):0;last=time;if(playing){elapsed+=dt*Number($('speed').value);if(elapsed>=duration){if(index<stages.length-1){index++;elapsed=0;render();}else{elapsed=duration;playing=false;updatePlay();}}draw();}requestAnimationFrame(tick);}
$('play').addEventListener('click',()=>{if(index===8&&elapsed>=duration)go(0);playing=!playing;updatePlay();});
$('next').addEventListener('click',()=>go(index+1));$('prev').addEventListener('click',()=>go(index-1));
$('reset').addEventListener('click',()=>{playing=false;go(0);});
document.addEventListener('visibilitychange',()=>{last=0;});
render();requestAnimationFrame(tick);
