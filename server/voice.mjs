import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import twilio from 'twilio';
import WebSocket, { WebSocketServer } from 'ws';
import { readFileSync } from 'node:fs';

const env = process.env;
const token = env.TWILIO_AUTH_TOKEN || env.twilio_ACCESS_TOKEN;
const required = { TWILIO_ACCOUNT_SID: env.TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN: token, OPENAI_API_KEY: env.OPENAI_API_KEY, PUBLIC_VOICE_URL: env.PUBLIC_VOICE_URL, VOICE_API_TOKEN: env.VOICE_API_TOKEN, TWILIO_FROM_NUMBER: env.TWILIO_FROM_NUMBER };
for (const [name, value] of Object.entries(required)) if (!value) throw new Error(`Missing ${name}`);
const publicUrl = new URL(env.PUBLIC_VOICE_URL);
if (publicUrl.protocol !== 'https:') throw new Error('PUBLIC_VOICE_URL must use HTTPS');
const client = twilio(env.TWILIO_ACCOUNT_SID, token);
const sessions = new Set();
const maxCalls = Number(env.VOICE_MAX_CONCURRENT || 5);
let pending = 0;
const send = (ws, data) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); };
const authorized = (header = '') => {
  const actual = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${env.VOICE_API_TOKEN}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};
const server = http.createServer(async (req, res) => {
  const reply = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (req.url === '/health' && req.method === 'GET') return reply(200, { ok: true, activeCalls: sessions.size });
  if (req.url !== '/calls' || req.method !== 'POST') return reply(404, { error: 'Not found' });
  if (!authorized(req.headers.authorization)) return reply(401, { error: 'Unauthorized' });
  try {
    let raw = '';
    for await (const chunk of req) { raw += chunk; if (raw.length > 4096) return reply(413, { error: 'Body too large' }); }
    const { to } = JSON.parse(raw);
    if (typeof to !== 'string' || !/^\+[1-9]\d{7,14}$/.test(to)) return reply(400, { error: 'Use an E.164 phone number' });
    if (sessions.size + pending >= maxCalls) return reply(429, { error: 'Call capacity full' });
    pending++;
    try {
      const xml = new twilio.twiml.VoiceResponse();
      xml.connect().stream({ url: `${publicUrl.origin.replace('https:', 'wss:')}/media-stream` });
      const call = await client.calls.create({ to, from: env.TWILIO_FROM_NUMBER, twiml: xml.toString(), timeout: 20, timeLimit: 180 });
      return reply(201, { callSid: call.sid, status: call.status });
    } finally { pending--; }
  } catch (error) {
    console.error('Call creation failed', error.code || error.name);
    return reply(502, { error: 'Call creation failed', code: error.code });
  }
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
server.on('upgrade', (req, socket, head) => {
  const valid = req.url === '/media-stream' && twilio.validateRequest(token, req.headers['x-twilio-signature'] || '', `${publicUrl.origin.replace('https:', 'wss:')}/media-stream`, {});
  if (!valid || sessions.size >= maxCalls) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
});
wss.on('connection', phone => {
  sessions.add(phone);
  const ai = new WebSocket(`wss://api.openai.com/v1/realtime?model=${encodeURIComponent(env.OPENAI_REALTIME_MODEL || 'gpt-realtime-2.1')}`, { headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` } });
  let streamSid, callSid, ready = false, timestamp = 0, itemId, audioStart, audioMs = 0;
  let ending = false, farewellDone = false, hangupStarted = false;
  const buffered = [];
  const marks = new Set();
  let markIndex = 0;
  const finishCall = async () => {
    if (!callSid || hangupStarted || !farewellDone || marks.size) return;
    hangupStarted = true;
    try { await client.calls(callSid).update({ status: 'completed' }); console.log('Scenario completed; call ended', callSid); }
    catch (error) { console.error('Hangup failed', error.code || error.name); }
  };
  const cleanup = () => { sessions.delete(phone); if (ai.readyState < 2) ai.close(); if (phone.readyState < 2) phone.close(); };
  const startupTimer = setTimeout(cleanup, 15000);
  phone.on('error', cleanup);
  ai.on('error', cleanup);
  phone.on('close', () => { clearTimeout(startupTimer); cleanup(); });
  ai.on('close', cleanup);
  ai.on('open', () => send(ai, { type: 'session.update', session: {
    type: 'realtime', output_modalities: ['audio'],
    instructions: env.VOICE_INSTRUCTIONS || readFileSync(new URL('./scenario.txt', import.meta.url), 'utf8'),
    tools: [{ type: 'function', name: 'end_call', description: '테스트가 끝났거나 상대가 종료를 요청했을 때 호출. 서버가 작별 인사를 재생한 후 전화를 종료한다.', parameters: { type: 'object', properties: {}, additionalProperties: false } }],
    audio: { input: { format: { type: 'audio/pcmu' }, turn_detection: { type: 'server_vad', interrupt_response: true, create_response: true } }, output: { format: { type: 'audio/pcmu' }, voice: 'marin' } },
  } }));
  phone.on('message', raw => {
    try {
      const message = JSON.parse(raw.toString());
      if (message.event === 'start') { streamSid = message.start.streamSid; callSid = message.start.callSid; console.log('Voice stream connected', callSid); }
      if (message.event === 'media') {
        timestamp = Number(message.media.timestamp);
        if (ending) return;
        if (ready) send(ai, { type: 'input_audio_buffer.append', audio: message.media.payload });
        else if (buffered.length < 250) buffered.push(message.media.payload);
        else cleanup();
      }
      if (message.event === 'mark') { marks.delete(message.mark.name); void finishCall(); }
      if (message.event === 'stop') cleanup();
    } catch { cleanup(); }
  });
  ai.on('message', raw => {
    try {
      const event = JSON.parse(raw.toString());
      if (event.type === 'session.updated' && !ready) {
        ready = true; clearTimeout(startupTimer);
        for (const audio of buffered.splice(0)) send(ai, { type: 'input_audio_buffer.append', audio });
        send(ai, { type: 'response.create', response: { instructions: '한국어로 AI 전화 연결 테스트라고 짧게 인사하고 잘 들리는지 물어보세요.' } });
      }
      if (event.type === 'response.output_audio.delta' && streamSid) {
        if (itemId !== event.item_id) { itemId = event.item_id; audioStart = timestamp; audioMs = 0; }
        audioMs += Buffer.from(event.delta, 'base64').length / 8;
        send(phone, { event: 'media', streamSid, media: { payload: event.delta } });
        const name = `audio-${markIndex++}`; marks.add(name);
        send(phone, { event: 'mark', streamSid, mark: { name } });
      }
      if (event.type === 'input_audio_buffer.speech_started' && !ending && itemId && marks.size) {
        send(phone, { event: 'clear', streamSid });
        send(ai, { type: 'conversation.item.truncate', item_id: itemId, content_index: 0, audio_end_ms: Math.max(0, Math.min(audioMs, timestamp - audioStart)) });
        marks.clear(); itemId = undefined;
      }
      if (event.type === 'response.done' && event.response.status === 'completed') {
        if (ending) { farewellDone = true; void finishCall(); }
        else {
          const end = event.response.output?.find(item => item.type === 'function_call' && item.name === 'end_call');
          if (end) {
            ending = true;
            send(ai, { type: 'conversation.item.create', item: { type: 'function_call_output', call_id: end.call_id, output: '{"farewell_pending":true}' } });
            send(ai, { type: 'session.update', session: { type: 'realtime', audio: { input: { turn_detection: null } } } });
            send(ai, { type: 'response.create', response: { tool_choice: 'none', instructions: '한국어로 다음 한 문장만 말하세요: 테스트에 참여해 주셔서 감사합니다. 이제 통화를 종료하겠습니다. 좋은 하루 보내세요.' } });
          }
        }
      }
      if (event.type === 'error') { console.error('Realtime error', event.error?.code); cleanup(); }
    } catch { cleanup(); }
  });
});
server.listen(Number(env.VOICE_PORT || 3001), '0.0.0.0', () => console.log('Voice bridge listening on', env.VOICE_PORT || 3001));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { for (const ws of sessions) ws.close(); server.close(); wss.close(); });
