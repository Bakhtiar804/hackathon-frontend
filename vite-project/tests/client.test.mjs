import test from 'node:test';
import assert from 'node:assert/strict';
import { api, ApiError, buildUrl, setToken, getToken } from '../src/api/client.js';
import { passwordError } from '../src/lib/password.js';
import { currentPolicy, money, todayISO } from '../src/lib/format.js';

const storage = new Map();
globalThis.localStorage = { getItem: (k) => storage.get(k) || null, setItem: (k,v) => storage.set(k,v), removeItem: (k) => storage.delete(k) };
globalThis.window = new EventTarget();
const response = (data, status = 200) => new Response(JSON.stringify({ success: status < 400, message: status < 400 ? 'OK' : 'Denied', data }), { status, headers: { 'Content-Type': 'application/json' } });

test('URL joins exactly one version prefix and encodes filters', () => {
  const url = buildUrl('/api/v1/employees', { search: 'A & B', empty: '', page: 2 });
  assert.equal(url.pathname, '/api/v1/employees');
  assert.equal(url.searchParams.get('search'), 'A & B');
  assert.equal(url.searchParams.has('empty'), false);
  assert.equal(buildUrl('//employees').pathname, '/api/v1/employees');
});

test('new password validates characters and UTF-8 byte bound', () => {
  assert.ok(passwordError('short'));
  assert.equal(passwordError('a'.repeat(72)), '');
  assert.ok(passwordError('a'.repeat(73)));
  assert.equal(passwordError('😀'.repeat(12)), '');
  assert.ok(passwordError('😀'.repeat(19)));
});

test('effective policies exclude future versions; money is paisa', () => {
  const today = todayISO();
  assert.equal(currentPolicy({ policies: [{ effectiveDate: '2200-01-01', timezone: 'Asia/Karachi' }, { effectiveDate: today, timezone: 'Asia/Karachi', officeStart: '09:00' }] }).officeStart, '09:00');
  assert.equal(currentPolicy({ policies: [{ effectiveDate: '2200-01-01' }] }), null);
  assert.equal(money(123456), 'PKR 1234.56');
});

test('shared client protects sessions, handles permissions and prevents duplicate writes', async () => {
  setToken('test-session');
  globalThis.fetch = async (_url, opts) => {
    assert.equal(opts.headers.Authorization, 'Bearer test-session');
    return response({ role: 'HR' });
  };
  assert.deepEqual(await api('/auth/me'), { role: 'HR' });
  globalThis.fetch = async () => response(null, 403);
  await assert.rejects(api('/users'), (error) => error instanceof ApiError && error.status === 403);
  assert.equal(getToken(), 'test-session');
  let unauthorized = 0;
  window.addEventListener('hcm:unauthorized', () => unauthorized++);
  globalThis.fetch = async () => response(null, 401);
  await assert.rejects(api('/auth/me'));
  assert.equal(getToken(), null);
  assert.equal(unauthorized, 1);
  let resolve;
  let writes = 0;
  globalThis.fetch = () => { writes++; return new Promise((r) => { resolve = r; }); };
  const first = api('/employees', { method: 'POST', body: {} });
  await assert.rejects(api('/employees', { method: 'POST', body: {} }), /already in progress/);
  resolve(response({ saved: true }));
  assert.deepEqual(await first, { saved: true });
  assert.equal(writes, 1);
  await assert.rejects(api('/employees', { method: 'POST', body: [] }), /check the fields/);
});

test('stale account responses are discarded, downloads bypass envelopes', async () => {
  setToken('old-session');
  let resolve;
  globalThis.fetch = () => new Promise((r) => { resolve = r; });
  const pending = api('/employees');
  setToken('new-session');
  resolve(response({ private: true }));
  await assert.rejects(pending, /session changed/);
  assert.equal(getToken(), 'new-session');
  globalThis.fetch = async () => new Response('code,name\nE1,Person', { headers: { 'Content-Type': 'text/csv' } });
  assert.equal(await api('/employees/export', { responseType: 'text' }), 'code,name\nE1,Person');
  setToken(null);
});

test('GET startup checks retry bounded transient failures while mutations never retry', async () => {
  let reads = 0;
  globalThis.fetch = async () => ++reads < 3 ? response(null, 503) : response({ initializationRequired: true });
  assert.equal((await api('/setup-status', { retryDelayMs: 0 })).initializationRequired, true);
  assert.equal(reads, 3);
  reads = 0;
  globalThis.fetch = async () => { reads++; throw new TypeError('Failed to fetch'); };
  await assert.rejects(api('/setup-status', { retryDelayMs: 0 }), (err) => err.kind === 'network' && err.url.endsWith('/setup-status'));
  assert.equal(reads, 3);
  reads = 0;
  await assert.rejects(api('/setup', { method: 'POST', body: {}, retries: 2, retryDelayMs: 0 }));
  assert.equal(reads, 1);
});

test('public requests omit saved authorization and timeouts preserve a valid session', async () => {
  setToken('keep-on-timeout');
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.headers.Authorization, undefined);
    return response({ initializationRequired: false });
  };
  await api('/setup-status');
  globalThis.fetch = async (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
  await assert.rejects(api('/auth/me', { timeoutMs: 5, retries: 0 }), (error) => error.kind === 'timeout');
  assert.equal(getToken(), 'keep-on-timeout');
  setToken(null);
});

test('incorrect current password is a form error, while invalid sessions still sign out', async () => {
  setToken('valid-change-session');
  globalThis.fetch = async () => new Response(JSON.stringify({ success: false, message: 'Current password is incorrect' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  await assert.rejects(api('/auth/change-password', { method: 'POST', body: { currentPassword: 'wrong', newPassword: 'new-password-123' } }), /Current password is incorrect/);
  assert.equal(getToken(), 'valid-change-session');
  globalThis.fetch = async () => new Response(JSON.stringify({ success: false, message: 'Invalid or expired session' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  await assert.rejects(api('/auth/change-password', { method: 'POST', body: { currentPassword: 'wrong', newPassword: 'new-password-123' } }), /Invalid or expired session/);
  assert.equal(getToken(), null);
});

test('correction timestamps use the requested local time across daylight-saving transitions', async () => {
  const { localDateTime } = await import('../src/lib/format.js');
  assert.equal(localDateTime('2026-03-08', '01:30', 'America/New_York'), '2026-03-08T06:30:00.000Z');
  assert.equal(localDateTime('2026-03-08', '03:30', 'America/New_York'), '2026-03-08T07:30:00.000Z');
  assert.throws(() => localDateTime('2026-03-08', '02:30', 'America/New_York'), /does not exist/);
  assert.equal(localDateTime('2026-10-25', '09:00', 'Asia/Karachi'), '2026-10-25T04:00:00.000Z');
});

test('company dates and status display follow the authenticated timezone and effective date', async () => {
  const { setCompanyTimezone, todayISO, futureEffectiveDate, employmentStatus } = await import('../src/lib/format.js');
  setCompanyTimezone('Pacific/Kiritimati');
  assert.equal(todayISO(), todayISO('Pacific/Kiritimati'));
  assert.equal(futureEffectiveDate('2200-01-01'), '2200-01-02');
  assert.equal(employmentStatus({ status: 'inactive', employmentHistory: [{ effectiveDate: '2000-01-01', status: 'active' }, { effectiveDate: '2200-01-01', status: 'inactive' }] }), 'active');
  setCompanyTimezone(null);
});

test('designation salary charts use average money amounts rather than employee counts', async () => {
  const { mapRows } = await import('../src/lib/people.js');
  assert.equal(mapRows({ engineer: { count: 3, averageGrossMinor: 12000000 } }, row => row.averageGrossMinor)[0].value, 12000000);
  assert.equal(mapRows({ engineering: 20000000 }, row => row.grossMinor ?? row)[0].value, 20000000);
});

test('short organization cache deduplicates reads, clones results, and clears on writes/account change', async () => {
  setToken('cached-account-one');
  let reads = 0;
  globalThis.fetch = async (_url, options) => options.method === 'GET' ? (reads++, response({ units: [{ name: 'Sales' }] })) : response({ saved: true });
  const [first, second] = await Promise.all([api('/organization', { cacheMs: 30000 }), api('/organization', { cacheMs: 30000 })]);
  assert.equal(reads, 1);
  first.units[0].name = 'Changed locally';
  assert.equal(second.units[0].name, 'Sales');
  assert.equal((await api('/organization', { cacheMs: 30000 })).units[0].name, 'Sales');
  assert.equal(reads, 1);
  await api('/organization/units', { method: 'POST', body: {} });
  await api('/organization', { cacheMs: 30000 });
  assert.equal(reads, 2);
  setToken('cached-account-two');
  await api('/organization', { cacheMs: 30000 });
  assert.equal(reads, 3);
  setToken(null);
});

test('department catalog keeps real IDs, normalizes aliases and excludes unsupported choices', async () => {
  const { DEPARTMENTS, departmentName, departmentUnits } = await import('../src/lib/departments.js');
  const { unitName } = await import('../src/lib/format.js');
  assert.equal(DEPARTMENTS.length, 6);
  assert.equal(departmentName(' HR '), 'Human Resources (HR)');
  assert.equal(departmentName('Engineering'), 'IT / Engineering');
  const units = [{ _id: 'legacy', kind: 'department', name: 'Engineering', active: true }, { _id: 'canonical', kind: 'department', name: 'IT / Engineering', active: true }, { _id: 'other', kind: 'department', name: 'Legacy Support', active: true }, { _id: 'job', kind: 'designation', name: 'HR', active: true }];
  assert.deepEqual(departmentUnits(units).map(unit => unit._id), ['canonical']);
  assert.equal(unitName(units, 'legacy'), 'IT / Engineering');
  assert.equal(unitName(units, 'job'), 'HR');
});
