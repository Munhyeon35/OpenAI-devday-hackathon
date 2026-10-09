import assert from 'node:assert/strict';
import test from 'node:test';
import { hospitalSearchSchema } from '../src/lib/hospitals.ts';
import { collectPages, openDataUrl, parseOpenDataXml, OpenDataError } from '../src/lib/server/opendata.ts';
import { handleHospitalSearch, parseReportTime, searchHospitalCandidates } from '../src/lib/server/hospital-candidates.ts';

const now = new Date('2026-10-09T03:00:00Z');
const input = (overrides = {}) => hospitalSearchSchema.parse({ latitude: 37.5665, longitude: 126.978, radiusKm: 20, ...overrides });
const hospital = (hpid, lat = '37.567') => ({ hpid, dutyname: `병원 ${hpid}`, dutyaddr: '서울특별시 중구', wgs84lat: lat, wgs84lon: '126.978', dutytel3: '02-123-4567' });
function fixture({ hospitals = [hospital('A'), hospital('B', '37.58')], beds = [], procedures = [], departmentIds = ['A'], fail = [] } = {}) {
  return async (operation, params = {}) => {
    if (fail.includes(operation)) throw new OpenDataError('safe provider failure');
    const items = operation === 'getEgytListInfoInqire' ? params.QD ? hospitals.filter((h) => departmentIds.includes(h.hpid)) : hospitals
      : operation === 'getEmrrmRltmUsefulSckbdInfoInqire' ? beds : procedures;
    return { items, retrievedAt: now.toISOString() };
  };
}
const freshBed = (hpid, overrides = {}) => ({ hpid, hvidate: '20261009115900', hvec: '3', hv28: '0', hvctayn: 'Y', ...overrides });

test('parse real XML shapes, normalize casing, preserve phone strings and negative beds', () => {
  const parsed = parseOpenDataXml('<?xml version="1.0"?><response><header><resultCode>00</resultCode></header><body><items><item><hpid>A</hpid><dutyTel3>02-123-4567</dutyTel3><dutyName>A &amp; B</dutyName><hvec>-2</hvec><hv28/></item></items><totalCount>1</totalCount></body></response>');
  assert.equal(parsed.items[0].dutyname, 'A & B');
  assert.equal(parsed.items[0].dutytel3, '02-123-4567');
  assert.equal(parsed.items[0].hvec, '-2');
  assert.equal(parsed.items[0].hv28, '');
  assert.deepEqual(parseOpenDataXml('<response><header><resultCode>00</resultCode></header><body><items/><totalCount>0</totalCount></body></response>').items, []);
});

test('reject invalid XML, provider failures and custom entities without leaking payloads', () => {
  for (const xml of ['<response>', '<html>private key</html>', '<!DOCTYPE a [<!ENTITY x "secret">]><a>&x;</a>',
    '<OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>30</returnReasonCode><returnAuthMsg>private-key</returnAuthMsg></cmmMsgHeader></OpenAPI_ServiceResponse>',
    '<response><header><resultCode>22</resultCode><resultMsg>private-key</resultMsg></header></response>']) {
    assert.throws(() => parseOpenDataXml(xml), (error) => error instanceof OpenDataError && !error.message.includes('private-key'));
  }
});

test('encoded and decoded service keys are encoded exactly once', () => {
  for (const key of ['example+key/==', 'example%2Bkey%2F%3D%3D']) {
    const url = openDataUrl('getEgytListInfoInqire', { pageNo: '1' }, key);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.hostname, 'apis.data.go.kr');
    assert.equal(url.searchParams.get('ServiceKey'), 'example+key/==');
  }
});

test('collect every page even if the provider caps page size', async () => {
  const calls = [];
  const result = await collectPages(async (page) => { calls.push(page); return { items: [{ hpid: String(page) }], totalCount: 3 }; });
  assert.deepEqual(calls, [1, 2, 3]);
  assert.equal(result.length, 3);
  await assert.rejects(() => collectPages(async () => ({ items: [], totalCount: 1 })), OpenDataError);
});

test('join by hospital ID and filter before limiting, using the V13 procedure codes', async () => {
  const result = await searchHospitalCandidates(input({ procedures: ['mkioskty1'], equipment: ['hvctayn'], beds: ['hvec'], limit: 1 }), fixture({
    beds: [freshBed('B'), freshBed('A')], procedures: [{ hpid: 'A', mkioskty1: 'N', mkioskty3: 'Y' }, { hpid: 'B', mkioskty1: 'Y' }],
  }), now);
  assert.equal(result.totalNearby, 2);
  assert.equal(result.totalMatched, 1);
  assert.equal(result.candidates[0].id, 'B');
  assert.equal(result.candidates[0].checks[0].label, '심근경색 재관류중재술');
  assert.equal(result.candidates[0].acceptance, 'unconfirmed');
  assert.equal(result.candidates[0].match, 'reported_match');
  assert.equal(result.distanceType, 'straight_line');
  assert.ok(!('eta' in result.candidates[0]));
});

test('missing, stale and unexpected values stay unknown; zero and negative counts exclude', async () => {
  const read = fixture({ hospitals: ['A','B','C','D','E'].map((id) => hospital(id)), beds: [freshBed('A', { hvec: '0' }), freshBed('B', { hvec: '-2' }), freshBed('C', { hvec: '' }), freshBed('D', { hvidate: '20261009090000' }), freshBed('E', { hvidate: '20261009130000' })] });
  const result = await searchHospitalCandidates(input({ beds: ['hvec'] }), read, now);
  assert.deepEqual(result.candidates.map((h) => h.id), ['C', 'D', 'E']);
  assert.ok(result.candidates.every((h) => h.checks[0].status === 'unknown'));
  assert.equal(result.candidates[0].beds.hvec, null);
  assert.equal((await searchHospitalCandidates(input({ beds: ['hvec'], includeUnknown: false }), read, now)).candidates.length, 0);
  const strange = await searchHospitalCandidates(input({ equipment: ['hvctayn'] }), fixture({ beds: [freshBed('A', { hvctayn: 'Y1' })] }), now);
  assert.ok(strange.candidates.every((h) => h.checks[0].status === 'unknown'));
});

test('procedure age restrictions require confirmation even when provider reports Y', async () => {
  const result = await searchHospitalCandidates(input({ procedures: ['mkioskty12'] }), fixture({ procedures: [{ hpid: 'A', mkioskty12: 'Y', mkioskty12msg: '5세 이상', mkioskty15msg: '저체중 출생아 조건' }] }), now);
  assert.equal(result.candidates[0].checks[0].status, 'unknown');
  assert.equal(result.candidates[0].checks[0].detail, '5세 이상');
  assert.deepEqual(result.candidates[0].procedureNotes, ['응급내시경 · 영유아 위장관: 5세 이상']);
});

test('department filtering uses ID membership and missing capacity returns a visible warning', async () => {
  const result = await searchHospitalCandidates(input({ departments: ['D003'], beds: ['hvec'] }), fixture({ fail: ['getEmrrmRltmUsefulSckbdInfoInqire'] }), now);
  assert.deepEqual(result.candidates.map((h) => h.id), ['A']);
  assert.equal(result.candidates[0].checks[1].status, 'unknown');
  assert.ok(result.warnings.some((w) => w.includes('조회에 실패')));
  assert.equal(result.sourceRetrievedAt.beds, null);
});

test('reject invalid coordinates and apply the radius across administrative boundaries', async () => {
  const result = await searchHospitalCandidates(input({ radiusKm: 1 }), fixture({ hospitals: [hospital('near'), hospital('far', '35.1'), hospital('bad', 'invalid'), hospital('out', '91')] }), now);
  assert.deepEqual(result.candidates.map((h) => h.id), ['near']);
  assert.equal(parseReportTime('20260230120000'), null);
  assert.equal(parseReportTime('invalid'), null);
});

function request(body, headers = {}) {
  return new Request('http://localhost:3000/api/hospitals/candidates', { method: 'POST', headers: { host: 'localhost:3000', origin: 'http://localhost:3000', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
}

test('validate request, limit body size and reject cross-origin requests before upstream work', async () => {
  const noFetch = async () => assert.fail('must not contact provider');
  for (const body of [{}, { latitude: 91, longitude: 127 }, { latitude: 37, longitude: 127, procedures: ['wrong'] }, { latitude: 37, longitude: 127, radiusKm: 1000 }]) {
    assert.equal((await handleHospitalSearch(request(body), noFetch)).status, 400);
  }
  assert.equal((await handleHospitalSearch(request({ big: 'x'.repeat(9000) }), noFetch)).status, 413);
  assert.equal((await handleHospitalSearch(request({}, { origin: 'https://other.example' }), noFetch)).status, 403);
  assert.equal((await handleHospitalSearch(request({}, { 'content-type': 'text/plain' }), noFetch)).status, 415);
});

test('route response is uncached and never exposes raw network errors or credentials', async () => {
  const response = await handleHospitalSearch(request(input()), async () => { throw new Error('secret-key-in-url'); });
  assert.equal(response.status, 502);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.ok(!(await response.text()).includes('secret-key'));
  const missingKey = await handleHospitalSearch(request(input()), async () => { throw new OpenDataError('키 설정 필요', 503); });
  assert.equal(missingKey.status, 503);
  const success = await handleHospitalSearch(request(input()), fixture());
  assert.equal(success.status, 200);
  assert.equal((await success.json()).source, '국립중앙의료원');
});
