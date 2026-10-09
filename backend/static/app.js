const $ = (selector) => document.querySelector(selector);
const form = $('#dispatch-form');
let config, jobId = sessionStorage.getItem('dispatchId'), timer, active = false;
let requestKey, requestFingerprint;
const phases = {queued:'발신 대기',dialing:'전화 연결 중',connected:'응급실 연결됨',confirming:'환자 정보 전달 · 수용 확답 확인 중',processing:'통화 종료 · 결과 정리 중',finished:'확인 종료'};
const labels = {accepted:'수용 가능',rejected:'수용 불가',unknown:'수용 불가'};
const deliveryLabels = {waiting:'답변 대기',local_only:'백엔드 저장 완료',pending:'백엔드 전송 중',delivered:'백엔드 전송 완료',failed:'백엔드 전송 실패'};
const escape = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function showError(message) { $('#error').textContent = message; $('#error').hidden = !message; }
async function api(path, options = {}) {
  const response = await fetch(path, {...options, headers:{'Content-Type':'application/json', Authorization:`Bearer ${$('#token').value}`, ...options.headers}});
  const body = await response.json();
  if (!response.ok) throw new Error(Array.isArray(body.detail) ? body.detail.map(e => `${e.loc.slice(1).join(' / ')}: ${e.msg}`).join('\n') : body.detail || '요청에 실패했습니다.');
  return body;
}
function render(job) {
  const opened = new Set([...document.querySelectorAll('details[open]')].map(el=>el.dataset.hospital));
  const finished = job.hospitals.filter(h=>h.result).length;
  const total = job.hospitals.length;
  const waiting = job.hospitals.some(h=>h.hangup_pending || h.delivery.status === 'pending');
  active = finished !== total || waiting;
  $('#submit').disabled = active;
  $('#cancel').hidden = finished === total && !job.hospitals.some(h=>h.hangup_pending);
  $('#retry-delivery').hidden = !job.hospitals.some(h=>h.delivery.status === 'failed');
  $('#counter').textContent = `${finished} / ${total}`;
  $('#job-info').textContent = `${job.mode === 'demo' ? '시뮬레이션 · ' : ''}${job.patient.name} 님 · ${new Date(job.created_at).toLocaleTimeString('ko-KR')} 요청 · ${finished === total ? '결과 확인 완료' : '병원별로 독립 확인 중'}`;
  $('#results').innerHTML = job.hospitals.map((h,index)=>{
    const result = h.result;
    const transcript = [];
    for (const fragment of h.transcript) {
      const last = transcript.at(-1);
      if (last?.speaker === fragment.speaker) last.text += fragment.text;
      else transcript.push({...fragment});
    }
    return `<article class="panel result-card"><div class="card-head"><div><h3>${index ? 'B' : 'A'} · ${escape(h.name)}</h3><p>${escape(h.phone)} · 출발 후 예상 ${h.eta_minutes}분</p></div><span class="badge ${result?.availability || ''}">${result ? labels[result.availability] : '확인 중'}</span></div>
      ${result ? `${result.evidence_quote ? `<blockquote class="quote">“${escape(result.evidence_quote)}”</blockquote>` : ''}<p class="reason">${escape(result.reason)}</p>${result.respondent ? `<p class="reason">확인 담당자 · ${escape(result.respondent)}</p>` : ''}` : `<div class="status-line"><span class="dot pulse"></span>${phases[h.phase] || escape(h.phase)}</div>`}
      ${transcript.length ? `<details class="transcripts" data-hospital="${h.id}" ${opened.has(h.id) ? 'open' : ''}><summary>통화 내용 보기</summary><div class="transcript">${transcript.map(t=>`<p><b>${t.speaker === 'hospital' ? '응급실' : 'AI 이송 지원'}</b>${escape(t.text)}</p>`).join('')}</div></details>` : ''}
      <div class="delivery"><span>${escape(deliveryLabels[h.delivery.status])}</span><span>${h.hangup_pending ? '통화 종료 처리 중' : result ? new Date(result.confirmed_at).toLocaleTimeString('ko-KR') : '응답을 기다리고 있습니다'}</span></div></article>`;
  }).join('');
  return active;
}
async function poll() {
  clearTimeout(timer);
  if (!jobId || (config.auth_required && !$('#token').value)) return;
  try {
    const job = await api(`/api/dispatches/${jobId}`);
    showError('');
    if (render(job)) timer = setTimeout(poll, 1200);
  } catch (error) {
    showError(`상태 조회 실패: ${error.message} 연결을 확인하고 다시 시도합니다.`);
    timer = setTimeout(poll, 4000);
  }
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!config || active) return;
  const fields = new FormData(form);
  const payload = {patient:{name:fields.get('name'),age:Number(fields.get('age')),condition:fields.get('condition'),location:fields.get('location')},hospitals:[1,2].map(n=>({name:fields.get(`hospital${n}`),phone:fields.get(`phone${n}`),eta_minutes:Number(fields.get(`eta${n}`))}))};
  const fingerprint = JSON.stringify(payload);
  // A network retry uses the same key, so it cannot dial the hospitals twice.
  if (fingerprint !== requestFingerprint) { requestFingerprint = fingerprint; requestKey = crypto.randomUUID(); }
  $('#submit').disabled = true; showError('');
  try {
    const job = await api('/api/dispatches',{method:'POST',headers:{'Idempotency-Key':requestKey},body:fingerprint});
    jobId = job.id; sessionStorage.setItem('dispatchId',jobId);
    requestFingerprint = null; render(job); poll();
  } catch (error) { showError(error.message); $('#submit').disabled = false; }
});
$('#cancel').addEventListener('click', async()=>{
  try { render(await api(`/api/dispatches/${jobId}/cancel`,{method:'POST'})); poll(); }
  catch(error) { showError(error.message); }
});
$('#retry-delivery').addEventListener('click', async()=>{
  try { render(await api(`/api/dispatches/${jobId}/retry-delivery`,{method:'POST'})); poll(); }
  catch(error) { showError(error.message); }
});
$('#connect').addEventListener('click', ()=>{showError(''); poll();});
$('#sample').addEventListener('click',()=>{
  const values = {name:'테스트 환자',age:'42',condition:'계단에서 넘어짐. 오른쪽 다리 통증, 의식 있음. 추가 활력징후는 미확인.',location:'서울시 중구 시청 앞 (가상 시나리오)',hospital1:'한빛 응급실 (가상)',phone1:'02-000-0001',eta1:'15',hospital2:'새봄 응급실 (가상)',phone2:'02-000-0002',eta2:'20'};
  Object.entries(values).forEach(([key,value])=>form.elements[key].value=value);
});
(async()=>{
  try {
    config = await api('/api/config');
    $('#mode').textContent = config.mode === 'demo' ? 'DEMO MODE' : 'LIVE CALLS';
    $('#demo-banner').hidden = config.mode !== 'demo'; $('#auth').hidden = !config.auth_required;
    $('#call-description').textContent = config.mode === 'demo' ? '실제 전화는 발신되지 않습니다.' : '버튼을 누르면 입력한 두 번호로 실제 전화가 발신됩니다.';
    if (config.mode === 'demo') $('#submit').firstChild.textContent = '두 병원 수용 확인 시뮬레이션 ';
    await poll();
  } catch(error) { showError(error.message); $('#submit').disabled = true; }
})();
