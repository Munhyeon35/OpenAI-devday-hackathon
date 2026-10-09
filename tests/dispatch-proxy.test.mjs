import assert from 'node:assert/strict';
import test from 'node:test';
import { proxyDispatch } from '../src/lib/server/dispatch-proxy.ts';
import { dispatchAsset } from '../src/lib/server/dispatch-assets.ts';

const path = '/api/dispatches';
const id = '00000000-0000-4000-8000-000000000001';
const env = { OPERATOR_TOKEN: 'server-only-test-token', DISPATCH_BACKEND_URL: 'http://127.0.0.1:8000' };
function request(method = 'POST', overrides = {}) {
  return new Request('http://localhost:3000' + path, {
    method,
    headers: { host: 'localhost:3000', origin: 'http://localhost:3000',
      'content-type': 'application/json', 'idempotency-key': 'same-request-key', ...overrides },
    ...(method === 'POST' ? { body: JSON.stringify({ patient: { name: '가상 환자' }, hospitals: [] }) } : {}),
  });
}

test('forward one POST with server-side auth and original idempotency key', async () => {
  let calls = 0;
  const response = await proxyDispatch(request('POST', { authorization: 'Bearer untrusted-browser-token' }), path, {
    env,
    fetcher: async (url, options) => {
      calls++;
      assert.equal(url.href, 'http://127.0.0.1:8000/api/dispatches');
      assert.equal(options.headers.get('authorization'), 'Bearer ' + env.OPERATOR_TOKEN);
      assert.equal(options.headers.get('idempotency-key'), 'same-request-key');
      assert.equal(JSON.parse(options.body).patient.name, '가상 환자');
      assert.equal(options.redirect, 'error');
      return Response.json({ id, status: 'running' }, { status: 202 });
    },
  });
  assert.equal(calls, 1);
  assert.equal(response.status, 202);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).id, id);
});

test('reject public, cross-origin, missing-origin, and mismatched-host requests before fetching', async () => {
  const fetcher = async () => { assert.fail('must not contact provider'); };
  const missing = request(); missing.headers.delete('origin');
  for (const req of [request('POST', { origin: 'https://attacker.example' }), missing,
    request('GET', { host: 'public.example' }), new Request('https://public.example/api/config')]) {
    assert.equal((await proxyDispatch(req, path, { env, fetcher })).status, 403);
  }
});

test('config hides operator prompt and exposes no upstream secret fields', async () => {
  const response = await proxyDispatch(request('GET'), '/api/config', { env,
    fetcher: async () => Response.json({ mode: 'live', auth_required: true, backbed_configured: false, token: 'hidden' }),
  });
  assert.deepEqual(await response.json(), { mode: 'live', auth_required: false, backbed_configured: false });
});

test('Next listening hostname can differ from the browser loopback hostname', async () => {
  const req = request('POST', { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' });
  const response = await proxyDispatch(req, path, { env, fetcher: async () => Response.json({ id }, { status: 202 }) });
  assert.equal(response.status, 202);
});

test('status, cancel and delivery retry remain separate allowed operations', async () => {
  const paths = [];
  const fetcher = async url => { paths.push(url.pathname); return Response.json({ ok: true }); };
  assert.equal((await proxyDispatch(request('GET'), `${path}/${id}`, { env, fetcher })).status, 200);
  for (const action of ['cancel', 'retry-delivery']) {
    assert.equal((await proxyDispatch(request(), `${path}/${id}/${action}`, { env, fetcher })).status, 200);
  }
  assert.deepEqual(paths, [`${path}/${id}`, `${path}/${id}/cancel`, `${path}/${id}/retry-delivery`]);
  assert.equal((await proxyDispatch(request(), `${path}/${id}/redial`, { env, fetcher })).status, 404);
  assert.equal(paths.length, 3);
});

test('provider validation failures propagate, ambiguous network failures never retry', async () => {
  let calls = 0;
  const response = await proxyDispatch(request(), path, { env, fetcher: async () => {
    calls++; throw Error('internal detail must not reach browser');
  } });
  assert.equal(response.status, 502); assert.equal(calls, 1);
  assert.ok(!(await response.text()).includes('internal detail'));
  const conflict = await proxyDispatch(request(), path, { env,
    fetcher: async () => Response.json({ detail: 'different input for same key' }, { status: 409 }),
  });
  assert.equal(conflict.status, 409);
});

test('reject oversized bodies and unsafe upstream origins', async () => {
  const fetcher = async () => { assert.fail('no upstream request expected'); };
  const big = new Request('http://localhost:3000/api/dispatches', { method: 'POST',
    headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' }, body: 'x'.repeat(65537) });
  assert.equal((await proxyDispatch(big, path, { env, fetcher })).status, 413);
  for (const origin of ['http://remote.example', 'https://user:password@remote.example', 'https://remote.example/path']) {
    assert.equal((await proxyDispatch(request(), path, { env: { ...env, DISPATCH_BACKEND_URL: origin }, fetcher })).status, 503);
  }
});

test('asset serving allows only the temporary UI and flow explainer', async () => {
  const response = await dispatchAsset('index.html');
  assert.equal(response.status, 200);
  assert.match(await response.text(), /dispatch-form/);
  for (const file of ['../.env', '.env', '__proto__', 'constructor'])
    assert.equal((await dispatchAsset(file)).status, 404);
});

test('SSE forwards initial and later chunks without waiting for stream completion',async()=>{
  let controller;
  let upstreamSignal;
  const source=new ReadableStream({start(c){controller=c;}});
  const response=await proxyDispatch(request('GET'),'/api/dispatches/events',{env,fetcher:async(url,options)=>{
    upstreamSignal=options.signal;
    assert.equal(options.headers.get('authorization'),'Bearer '+env.OPERATOR_TOKEN);
    assert.equal(options.headers.get('accept'),'text/event-stream');
    return new Response(source,{headers:{'content-type':'text/event-stream'}});
  }});
  assert.equal(response.headers.get('content-type'),'text/event-stream; charset=utf-8');
  const reader=response.body.getReader();
  controller.enqueue(new TextEncoder().encode('event: snapshot\ndata: {}\n\n'));
  assert.match(new TextDecoder().decode((await reader.read()).value),/snapshot/);
  controller.enqueue(new TextEncoder().encode('event: update\ndata: {}\n\n'));
  assert.match(new TextDecoder().decode((await reader.read()).value),/update/);
  assert.equal(upstreamSignal.aborted,false);
  await reader.cancel();
});

test('SSE abort propagates to upstream and public clients never get operator access',async()=>{
  const abort=new AbortController();let signal;
  const request=new Request('http://localhost:3000/api/dispatches/events',{headers:{host:'localhost:3000'},signal:abort.signal});
  const response=await proxyDispatch(request,'/api/dispatches/events',{env,fetcher:async(url,options)=>{
    signal=options.signal; return new Response('event: snapshot\ndata: {}\n\n',{headers:{'content-type':'text/event-stream'}});
  }});
  abort.abort();assert.equal(signal.aborted,true);await response.body.cancel();
  const blocked=await proxyDispatch(new Request('https://public.example/api/dispatches/events'),'/api/dispatches/events',{env,fetcher:()=>{throw Error('must not fetch');}});
  assert.equal(blocked.status,403);
});

test('presentation server rejects all non-demo numbers, including stale frontend requests',async()=>{
  const demoEnv={...env,DEMO_CALL_ROUTING:'true',DEMO_GANGNAM_PHONE:'+821011111111',DEMO_CHUNGANG_PHONE:'+821022222222'};
  let forwards=0;
  const fetcher=async()=>{forwards++;return Response.json({id});};
  const send=hospitals=>proxyDispatch(new Request('http://localhost:3000/api/dispatches',{
    method:'POST',headers:{origin:'http://localhost:3000','content-type':'application/json'},
    body:JSON.stringify({patient:{name:'가상 환자'},hospitals}),
  }),path,{env:demoEnv,fetcher});
  assert.equal((await send([{name:'강남세브란스병원',phone:'+82212345678'}])).status,403);
  assert.equal((await send([{name:'중앙대학교광명병원',phone:demoEnv.DEMO_CHUNGANG_PHONE}])).status,403);
  assert.equal((await send([{name:'다른 병원',phone:demoEnv.DEMO_GANGNAM_PHONE}])).status,403);
  assert.equal(forwards,0);
  assert.equal((await send([{name:'강남세브란스병원',phone:demoEnv.DEMO_GANGNAM_PHONE},{name:'중앙대학교병원',phone:demoEnv.DEMO_CHUNGANG_PHONE}])).status,200);
  assert.equal(forwards,1);
});
