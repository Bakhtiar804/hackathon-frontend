import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const contract = JSON.parse(fs.readFileSync(new URL('../docs/openapi.json', import.meta.url)));
test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => { throw error; });
});

const personId = '0123456789abcdef01234567';
const makeUser = (role = 'Employee', mustChangePassword = false) => ({ id: '0123456789abcdef01234568', email: 'person@example.com', role, active: true, employeeId: personId, mustChangePassword });
const policy = { effectiveDate: '2020-01-01', timezone: 'Asia/Karachi', officeStart: '09:00', officeEnd: '18:00', graceMinutes: 15, halfDayHours: 5, weekendDays: [6,7], leaveTypes: [{ name: 'annual', quota: 14, paid: true, active: true }], holidays: [] };
const org = { company: { name: 'Test workspace', policies: [policy] }, units: [{ _id: personId, kind: 'department', name: 'IT / Engineering', active: true }, { _id: '0123456789abcdef01234569', kind: 'designation', name: 'Developer', active: true }] };

async function mockApi(page, { initializationRequired = false, user = makeUser(), failSetup = false, meStatus = 200, handler } = {}) {
  const calls = [];
  await page.route('https://hackathon-backend-d180.onrender.com/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    const body = request.postDataJSON();
    const fullPath = `/api/v1${path}`;
    const definition = Object.entries(contract.paths).find(([template]) => new RegExp(`^${template.replace(/\{[^}]+\}/g, '[^/]+')}$`).test(fullPath))?.[1]?.[request.method().toLowerCase()];
    expect(definition, `Documented endpoint ${request.method()} ${path}`).toBeTruthy();
    const schema = definition.requestBody?.content?.['application/json']?.schema;
    if (schema) {
      expect(body).toBeTruthy();
      expect(Object.keys(body).every((key) => key in schema.properties), `Allowlisted fields for ${path}`).toBe(true);
      for (const key of schema.required || []) expect(body).toHaveProperty(key);
    }
    calls.push({ path, query: Object.fromEntries(new URL(request.url()).searchParams), method: request.method(), body, authorization: request.headers().authorization });
    const send = (data, status = 200, message = 'OK') => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ success: status < 400, message, data }) });
    if (handler && await handler({ path, body, send, request, route, calls })) return;
    if (path === '/setup-status') return failSetup ? send(null, 503, 'Service starting') : send({ initializationRequired });
    if (path === '/setup') { initializationRequired = false; return send({ companyName: 'Test workspace', user }); }
    if (path === '/auth/login') return send({ token: 'browser-test-session', user });
    if (path === '/auth/me') return send(user, meStatus);
    if (path === '/auth/change-password') return send({ loginRequired: true });
    if (path === '/auth/logout') return send({ loggedOut: true });
    if (path === '/organization') return send(org);
    if (path === '/employees/me') return send({ employee: { _id: personId, name: 'Test person', code: 'E1', email: user.email, departmentId: personId, designationId: org.units[1]._id, status: 'active' }, attendance: [], leaves: [], payslips: [] });
    if (path === '/dashboard') return send({ announcements: [], hoursWorked: 0, weeklyTargetHours: 40 });
    if (path === '/payroll' || path === '/payslips') return send([]);
    if (path === '/leaves/balances/me') return send({ types: [{ type: 'annual', quota: 14, remaining: 14, used: 0, active: true }] });
    return send({ items: [], total: 0, page: 1, limit: 20 });
  });
  return calls;
}

async function seed(page) {
  await page.addInitScript(() => localStorage.setItem('hcm_token', 'browser-test-session'));
}

test('password eyes preserve values without submitting; account navigation stays available', async ({ page }) => {
  const calls = await mockApi(page, { initializationRequired: true });
  await page.goto('/setup');
  for (const label of ['Admin password', 'Confirm password']) {
    const input = page.getByLabel(label, { exact: true });
    await input.fill('preserved-secret-123');
    const eye = page.getByRole('button', { name: `Show ${label.toLowerCase()}`, exact: true });
    await expect(eye).toHaveAttribute('type', 'button');
    await eye.click();
    await expect(input).toHaveAttribute('type', 'text');
    await expect(input).toHaveValue('preserved-secret-123');
    await page.getByRole('button', { name: `Hide ${label.toLowerCase()}`, exact: true }).click();
    await expect(input).toHaveAttribute('type', 'password');
  }
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  await page.getByLabel('Password', { exact: true }).fill('preserved-secret-123');
  await page.getByRole('button', { name: 'Show password', exact: true }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('preserved-secret-123');
  expect(calls.some(c => c.method === 'POST')).toBe(false);
  await expect(page.getByRole('link', { name: 'Create Workspace', exact: true })).toBeVisible();
});

test('old initialized deployment explains why independent workspace creation needs deployment', async ({ page }) => {
  const calls = await mockApi(page);
  await page.goto('/login');
  await page.getByRole('link', { name: 'Create Workspace', exact: true }).click();
  await expect(page.getByText(/requires deploying the workspace backend update/)).toBeVisible();
  await expect(page.getByLabel('Company name')).toHaveCount(0);
  expect(calls.some(c => c.method === 'POST')).toBe(false);
});

test('theme toggle updates button variants, form controls and header with readable contrast', async ({ page }, testInfo) => {
  await seed(page);
  await mockApi(page, { user: makeUser('Admin') });
  await page.goto('/organization');
  await expect(page.getByRole('button', { name: 'Publish policy version', exact: true })).toBeVisible();
  const snapshot = async () => { await page.mouse.move(0, 0); return page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const selectors = ['.btn:not(.secondary):not(.ghost):not(.danger):not(.warn)', '.btn.secondary', '.btn.ghost', '.btn.danger', 'input:not([type=checkbox])', '.workspace-header', '.header-avatar'];
    return { theme: document.documentElement.dataset.theme, scheme: root.colorScheme, styles: selectors.map(selector => { const style = getComputedStyle(document.querySelector(selector)); return { selector, color: style.color, background: style.backgroundColor, border: style.borderColor }; }) };
  }); };
  const light = await snapshot();
  await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const dark = await snapshot();
  expect(dark.scheme).toBe('dark');
  for (const index of [0, 1, 2, 3, 4, 6]) expect(dark.styles[index].color, dark.styles[index].selector).not.toBe(light.styles[index].color);
  for (const index of [0, 1, 3, 4]) expect(dark.styles[index].background, dark.styles[index].selector).not.toBe(light.styles[index].background);
  const ratio = (foreground, background) => {
    const lum = value => { const channels = value.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722; };
    const a = lum(foreground), b = lum(background); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  };
  for (const index of [0, 1, 3, 4, 6]) expect(ratio(dark.styles[index].color, dark.styles[index].background), dark.styles[index].selector).toBeGreaterThanOrEqual(4.5);
  await page.screenshot({ path: testInfo.outputPath('dark-organization.png'), fullPage: true });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const restored = await snapshot();
  expect(restored.styles).toEqual(light.styles);
});

test('saved dark theme applies to authentication logo, inputs and password controls', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('hcm_theme', 'dark'));
  await mockApi(page);
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const colors = await page.evaluate(() => ({ logo: getComputedStyle(document.querySelector('.auth-logo svg path')).stroke, input: getComputedStyle(document.querySelector('input')).color, button: getComputedStyle(document.querySelector('button[type=submit]')).color }));
  expect(colors.logo).toBe('rgb(16, 32, 22)');
  expect(colors.input).toBe('rgb(240, 238, 228)');
  expect(colors.button).toBe('rgb(16, 32, 22)');
  await page.getByLabel('Password', { exact: true }).fill('retained-password');
  await page.getByRole('button', { name: 'Show password', exact: true }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('retained-password');
});

test('Employee 360 renders independently of slow job metadata and recovers job options', async ({ page }) => {
  await seed(page);
  let release;
  const delayed = new Promise(resolve => { release = resolve; });
  await mockApi(page, { user: makeUser('HR'), handler: async ({ path, send }) => {
    if (path === '/organization') { await delayed; await send(org); return true; }
    if (path === `/employees/${personId}`) { await send({ employee: { _id: personId, name: 'Fast profile', code: 'FAST01', email: 'fast@example.com', departmentId: personId, designationId: org.units[1]._id, joiningDate: '2026-01-01', status: 'active', phone: '03001234567', salaryHistory: [], employmentHistory: [] }, attendance: [], leaves: [], payslips: [] }); return true; }
  } });
  try {
    await page.goto(`/employees/${personId}`);
    await expect(page.getByRole('heading', { name: 'Fast profile', exact: true })).toBeVisible();
    await expect(page.getByLabel('Phone', { exact: true })).toHaveValue('03001234567');
    release();
    await expect(page.getByLabel('Department', { exact: true }).getByRole('option', { name: 'IT / Engineering', exact: true })).toBeAttached();
  } finally { release(); }
});

test('department creation offers only the six requested options and an explicit persisted setup action', async ({ page }) => {
  await seed(page);
  const calls = await mockApi(page, { user: makeUser('Admin'), handler: async ({ path, send }) => {
    if (path === '/organization/departments/configure') { await send({ units: org.units }); return true; }
  } });
  await page.goto('/organization');
  const add = page.locator('form').filter({ has: page.getByRole('button', { name: 'Add unit', exact: true }) });
  expect(await add.getByLabel('Unit name', { exact: true }).getByRole('option').allTextContents()).toEqual(['Choose department', 'IT / Engineering', 'Human Resources (HR)', 'Finance / Accounts', 'Sales', 'Marketing', 'Operations']);
  await page.getByRole('button', { name: 'Set up all departments', exact: true }).click();
  await expect(page.locator('.banner.ok')).toContainText('six departments are ready');
  expect(calls.find(call => call.path === '/organization/departments/configure').body).toEqual({});
});

test('Employee 360 remains usable when organization metadata is unavailable', async ({ page }) => {
  await seed(page);
  let unavailable = true;
  await mockApi(page, { user: makeUser('HR'), handler: async ({ path, send }) => {
    if (path === '/organization' && unavailable) { await send(null, 503, 'Metadata unavailable'); return true; }
    if (path === `/employees/${personId}`) { await send({ employee: { _id: personId, name: 'Resilient profile', code: 'R01', email: 'resilient@example.com', departmentId: personId, designationId: org.units[1]._id, status: 'active' }, attendance: [], leaves: [], payslips: [] }); return true; }
  } });
  await page.goto(`/employees/${personId}`);
  await expect(page.getByRole('heading', { name: 'Resilient profile', exact: true })).toBeVisible();
  await expect(page.getByLabel('Phone', { exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Retry job options', exact: true })).toBeVisible({ timeout: 10000 });
  unavailable = false;
  await page.getByRole('button', { name: 'Retry job options', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry job options', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Department', { exact: true })).toHaveValue(personId);
});

test('employee profile displays its own job names without staff-only organization access', async ({ page }) => {
  await seed(page);
  const calls = await mockApi(page, { user: makeUser('Employee'), handler: async ({ path, send }) => {
    if (path === '/employees/me') { await send({ employee: { _id: personId, name: 'Own complete profile', code: 'OWN01', email: 'own@example.com', departmentId: personId, designationId: org.units[1]._id, joiningDate: '2026-01-01', status: 'active' }, timezone: 'Asia/Karachi', job: { departmentName: 'IT / Engineering', designationName: 'Developer' }, attendance: [], leaves: [], payslips: [] }); return true; }
  } });
  await page.goto('/employees/me');
  await expect(page.getByRole('heading', { name: 'Own complete profile', exact: true })).toBeVisible();
  await expect(page.locator('.profile-facts')).toContainText('IT / Engineering');
  await expect(page.locator('.profile-facts')).toContainText('Developer');
  expect(calls.some(call => call.path === '/organization')).toBe(false);
});

test('slow logout cannot redirect away from a newly opened workspace form', async ({ page }) => {
  await seed(page);
  let finishLogout;
  const pending = new Promise(resolve => { finishLogout = resolve; });
  let completed = false;
  await mockApi(page, { user: makeUser('Admin'), handler: async ({ path, send }) => {
    if (path === '/setup-status') { await send({ initializationRequired: false, workspaceCreationAvailable: true }); return true; }
    if (path === '/auth/logout') { await pending; await send({ loggedOut: true }); completed = true; return true; }
  } });
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'Log out', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Create Workspace', exact: true }).click();
    await page.getByLabel('Company name', { exact: true }).fill('Keep my new workspace form');
    finishLogout();
    await expect.poll(() => completed).toBe(true);
    await expect(page).toHaveURL(/setup$/);
    await expect(page.getByLabel('Company name', { exact: true })).toHaveValue('Keep my new workspace form');
  } finally { finishLogout(); }
});

test('directory pagination and CSV use applied filters; clear resets all fields', async ({ page }) => {
  await seed(page);
  const calls = await mockApi(page, { user: makeUser('HR'), handler: async ({ path, send, route }) => {
    if (path === '/employees') { await send({ items: [{ _id: personId, name: 'Alice', code: 'AL01', email: 'alice@example.com', status: 'active' }], total: 45, page: Number(new URL(route.request().url()).searchParams.get('page') || 1), limit: 20 }); return true; }
    if (path === '/employees/export') { await route.fulfill({ contentType: 'text/csv', body: 'name,email\nAlice,alice@example.com' }); return true; }
  } });
  await page.goto('/employees');
  await expect(page.getByText('Alice', { exact: true })).toBeVisible();
  await page.getByLabel('Search employees', { exact: true }).fill(' Al ');
  await page.getByLabel('Department filter').selectOption(personId);
  await page.getByLabel('Designation filter').selectOption(org.units[1]._id);
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await expect.poll(() => calls.filter(c => c.path === '/employees').at(-1)?.query.search).toBe('Al');
  await page.getByLabel('Search employees', { exact: true }).fill('Unapplied');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect.poll(() => calls.filter(c => c.path === '/employees').at(-1)?.query.page).toBe('2');
  expect(calls.filter(c => c.path === '/employees').at(-1).query).toMatchObject({ search: 'Al', departmentId: personId, designationId: org.units[1]._id });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
  await download;
  expect(calls.find(c => c.path === '/employees/export').query).toMatchObject({ search: 'Al', designationId: org.units[1]._id });
  expect(calls.find(c => c.path === '/employees/export').query).not.toHaveProperty('page');
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page.getByLabel('Search employees', { exact: true })).toHaveValue('');
  await expect.poll(() => calls.filter(c => c.path === '/employees').at(-1)?.query).toEqual({ page: '1', limit: '20', sort: 'name' });
});

for (const screen of ['attendance', 'leave', 'audit']) {
  test(`${screen} pagination keeps the applied date range until Filter is pressed`, async ({ page }) => {
    await seed(page);
    const endpoint = screen === 'audit' ? '/audit-logs' : screen === 'leave' ? '/leaves' : '/attendance';
    const calls = await mockApi(page, { user: makeUser('Admin'), handler: async ({ path, send, request }) => {
      if (path === endpoint) { await send({ items: [], total: 45, page: Number(new URL(request.url()).searchParams.get('page') || 1), limit: 20 }); return true; }
    } });
    await page.goto(`/${screen}`);
    await expect(page.getByLabel('From', { exact: true })).toBeVisible();
    await page.getByLabel('From', { exact: true }).fill('2026-01-01');
    await page.getByLabel('To', { exact: true }).fill('2026-01-31');
    await page.getByRole('button', { name: screen === 'attendance' ? 'Load' : 'Filter', exact: true }).click();
    await expect.poll(() => calls.filter(c => c.path === endpoint).at(-1)?.query.from).toBe('2026-01-01');
    await page.getByLabel('From', { exact: true }).fill('2026-02-01');
    await page.getByRole('button', { name: 'Next', exact: true }).first().click();
    await expect.poll(() => calls.filter(c => c.path === endpoint).at(-1)?.query.page).toBe('2');
    expect(calls.filter(c => c.path === endpoint).at(-1).query).toMatchObject({ from: '2026-01-01', to: '2026-01-31' });
  });
}

test('dashboard AI summary refreshes the exact selected data and clears stale insights', async ({ page }) => {
  await seed(page);
  const calls = await mockApi(page, { user: makeUser('Admin'), handler: async ({ path, send }) => {
    if (path === '/ai/summary') { await send({ label: 'AI-generated', bullets: ['Verified selected period'] }); return true; }
  } });
  await page.goto('/');
  await page.getByLabel('From', { exact: true }).fill('2026-01-01');
  await page.getByLabel('To', { exact: true }).fill('2026-01-31');
  await page.getByRole('button', { name: 'Summarize', exact: true }).click();
  await expect(page.getByText('Verified selected period')).toBeVisible();
  const summaryIndex = calls.findIndex(c => c.path === '/ai/summary');
  expect(calls.slice(0, summaryIndex).filter(c => c.path === '/dashboard').at(-1).query).toMatchObject({ from: '2026-01-01', to: '2026-01-31' });
  expect(calls[summaryIndex].body.filters).toEqual({ from: '2026-01-01', to: '2026-01-31' });
  await page.getByRole('button', { name: 'This month', exact: true }).click();
  await expect(page.getByText('Verified selected period')).toHaveCount(0);
});

test('personal attendance calendar loads all own month records and never invents absences', async ({ page }) => {
  await seed(page);
  const calls = await mockApi(page, { user: makeUser('Employee'), handler: async ({ path, request, send }) => {
    const query = new URL(request.url()).searchParams;
    if (path === '/attendance' && query.get('limit') === '100') {
      await send({ items: [{ _id: personId, employeeId: personId, date: query.get('from'), status: 'present', checkIn: `${query.get('from')}T04:00:00Z`, checkOut: `${query.get('from')}T12:00:00Z` }], total: 1, page: 1, limit: 100 }); return true;
    }
  } });
  await page.goto('/attendance');
  await expect(page.getByRole('heading', { name: 'My attendance calendar', exact: true })).toBeVisible();
  await page.getByLabel('Calendar month', { exact: true }).fill('2026-09');
  await expect(page.getByRole('list', { name: 'Attendance for 2026-09', exact: true })).toBeVisible();
  await expect(page.getByRole('listitem', { name: '2026-09-01: present', exact: true })).toBeVisible();
  await expect(page.getByRole('listitem', { name: '2026-09-02: No saved record', exact: true })).toBeVisible();
  const calendarRequest = calls.filter(c => c.path === '/attendance' && c.query.from === '2026-09-01').at(-1);
  expect(calendarRequest.query).toMatchObject({ from: '2026-09-01', to: '2026-09-30', employeeId: personId, limit: '100' });
  await expect(page.getByRole('listitem', { name: /absent/ })).toHaveCount(0);
});

test('HR late KPI includes late half-days rather than only the exclusive late status', async ({ page }) => {
  await seed(page);
  await mockApi(page, { user: makeUser('HR'), handler: async ({ path, send }) => {
    if (path === '/dashboard') { await send({ attendance: { late: 0, lateFlags: 2, half_day: 2 }, announcements: [] }); return true; }
  } });
  await page.goto('/');
  const card = page.locator('.kpi').filter({ has: page.getByText('Late today', { exact: true }) });
  await expect(card.locator('.value')).toHaveText('2');
});

test('Admin dashboard exposes required breakdowns and keeps YTD separate from selected range', async ({ page }) => {
  await seed(page);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const utilization = [{ type: 'annual', used: 2, quota: 14, percent: 2 / 14 * 100 }, { type: 'unpaid', used: 1, quota: null, percent: null }];
  const calls = await mockApi(page, { user: makeUser('Admin'), handler: async ({ path, request, send }) => {
    if (path !== '/dashboard') return false;
    const query = new URL(request.url()).searchParams;
    await send({ attritionPercent: query.get('from') === `${today.slice(0,4)}-01-01` && query.get('to') === today ? 7 : 2, headcount: 3,
      byDepartment: [{ departmentId: personId, headcount: 3, averageGrossMinor: 150000, leaveUtilizationByType: utilization }], leaveUtilizationByType: utilization,
      payroll: { byMonth: { '2025-02': { grossMinor: 450000, netMinor: 420000 } }, byDepartment: { [personId]: { grossMinor: 450000, netMinor: 420000 } } }, announcements: [] }); return true;
  } });
  await page.goto('/');
  await page.getByLabel('From', { exact: true }).fill('2025-02-01');
  await page.getByLabel('To', { exact: true }).fill('2025-02-28');
  await page.getByLabel('Department', { exact: true }).selectOption(personId);
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.locator('.kpi').filter({ has: page.getByText('Attrition YTD', { exact: true }) }).locator('.value')).toHaveText('7.0%');
  await expect(page.locator('.kpi').filter({ has: page.getByText('Attrition in range', { exact: true }) }).locator('.value')).toHaveText('2.0%');
  const card = name => page.locator('.card').filter({ has: page.getByRole('heading', { name, exact: true }) });
  await expect(card('Headcount by department')).toContainText('Engineering');
  await expect(card('Average gross by department')).toContainText('PKR 1500.00');
  await expect(card('Payroll by month')).toContainText('PKR 4500.00');
  await expect(card('Payroll by month')).toContainText('PKR 4200.00');
  await expect(card('Payroll cost by department')).toContainText('PKR 4200.00');
  await expect(card('Leave utilization by type')).toContainText('Unlimited');
  await expect(card('Leave utilization by department')).toContainText('Engineering');
  expect(calls.some(c => c.path === '/dashboard' && c.query.from === `${today.slice(0,4)}-01-01` && c.query.departmentId === personId)).toBe(true);
  await expect(page.locator('main')).not.toContainText('NaN');
  await page.setViewportSize({ width: 375, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('HR today KPIs do not become month totals when a historical range is selected', async ({ page }) => {
  await seed(page);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  await mockApi(page, { user: makeUser('HR'), handler: async ({ path, request, send }) => {
    if (path !== '/dashboard') return false;
    const query = new URL(request.url()).searchParams;
    const daily = query.get('from') === today && query.get('to') === today;
    await send({ attendance: daily ? { present: 3, on_leave: 1, lateFlags: 2 } : { present: 40, on_leave: 10, lateFlags: 30 }, announcements: [] }); return true;
  } });
  await page.goto('/');
  await page.getByLabel('From', { exact: true }).fill('2025-02-01');
  await page.getByLabel('To', { exact: true }).fill('2025-02-28');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  for (const [label, expected] of [['Present today', '3'], ['On leave today', '1'], ['Late today', '2']]) {
    await expect(page.locator('.kpi').filter({ has: page.getByText(label, { exact: true }) }).locator('.value')).toHaveText(expected);
  }
});

test('scheduled policy remains visibly saved and can seed a later draft', async ({ page }) => {
  await seed(page);
  const future = { ...policy, effectiveDate: '2099-01-01', officeStart: '10:00', officeEnd: '19:00' };
  const calls = await mockApi(page, { user: makeUser('Admin'), handler: async ({ path, send }) => {
    if (path === '/organization') { await send({ ...org, company: { ...org.company, policies: [policy, future] } }); return true; }
  } });
  await page.goto('/organization');
  await expect(page.getByText('Scheduled policy versions (1)', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Office start', { exact: true })).toHaveValue('09:00');
  await page.getByRole('button', { name: 'Use as draft', exact: true }).click();
  await expect(page.getByLabel('Office start', { exact: true })).toHaveValue('10:00');
  await expect(page.getByLabel('Effective date of this version', { exact: true })).toHaveValue('2099-01-02');
  expect(calls.some(c => c.method !== 'GET')).toBe(false);
});

test('mandatory password change eyes preserve all three values without submitting', async ({ page }) => {
  await seed(page);
  const calls = await mockApi(page, { user: makeUser('HR', true) });
  await page.goto('/change-password');
  for (const label of ['Current / temporary password', 'New password', 'Confirm new password']) {
    const input = page.getByLabel(label, { exact: true });
    await input.fill('preserved-secret-123');
    const eye = page.getByRole('button', { name: `Show ${label.toLowerCase()}`, exact: true });
    await expect(eye).toHaveAttribute('type', 'button');
    await eye.click();
    await expect(input).toHaveAttribute('type', 'text');
    await expect(input).toHaveValue('preserved-secret-123');
    await page.getByRole('button', { name: `Hide ${label.toLowerCase()}`, exact: true }).click();
    await expect(input).toHaveAttribute('type', 'password');
  }
  expect(calls.some(c => c.method === 'POST')).toBe(false);
});

test('setup status failure shows retry, never setup form', async ({ page }) => {
  await mockApi(page, { failSetup: true });
  await page.goto('/setup');
  await expect(page.getByRole('heading', { name: 'Cannot connect' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
  await expect(page.getByLabel('Company name')).toHaveCount(0);
});

test('setup requires fresh sign-in and never automatically logs in', async ({ page }) => {
  const calls = await mockApi(page, { initializationRequired: true, user: makeUser('Admin') });
  await page.goto('/');
  await expect(page).toHaveURL(/setup$/);
  await page.getByLabel('Company name').fill('My company');
  await page.getByLabel('Admin email').fill('admin@example.com');
  await page.getByLabel('Admin password', { exact: true }).fill('strong-password-123');
  await page.getByLabel('Confirm password', { exact: true }).fill('strong-password-123');
  await page.getByRole('button', { name: 'Create workspace', exact: true }).click();
  await expect(page).toHaveURL(/login$/);
  await expect(page.getByRole('status')).toContainText('Your company is ready');
  expect(calls.some((call) => call.path === '/auth/login')).toBe(false);
});

test('initialized login keeps account navigation visible', async ({ page }) => {
  await mockApi(page);
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Create Workspace', exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/JWT|No dummy data/);
});

test('mandatory password change blocks direct routes and discards session', async ({ page }) => {
  await seed(page);
  const calls = await mockApi(page, { user: makeUser('HR', true) });
  await page.goto('/users');
  await expect(page).toHaveURL(/change-password$/);
  expect(calls.some((call) => call.path === '/users')).toBe(false);
  await page.getByLabel('Current / temporary password', { exact: true }).fill('temporary-password');
  await page.getByLabel('New password', { exact: true }).fill('a-new-strong-password');
  await page.getByLabel('Confirm new password', { exact: true }).fill('a-new-strong-password');
  await page.getByRole('button', { name: 'Update password & sign in again', exact: true }).click();
  await expect(page).toHaveURL(/login$/);
  expect(await page.evaluate(() => localStorage.getItem('hcm_token'))).toBeNull();
  expect(calls.filter((call) => call.path === '/auth/login')).toHaveLength(0);
  expect(calls.find((call) => call.path === '/auth/change-password').body).toEqual({ currentPassword: 'temporary-password', newPassword: 'a-new-strong-password' });
});

test('restore session validates before protected records and rejects expired session', async ({ page }) => {
  await seed(page);
  const calls = await mockApi(page, { meStatus: 401 });
  await page.goto('/');
  await expect(page).toHaveURL(/login$/);
  expect(calls.some((call) => call.path === '/dashboard')).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem('hcm_token'))).toBeNull();
});

test('temporary session validation outage offers retry without deleting session', async ({ page }) => {
  await seed(page);
  await mockApi(page, { meStatus: 503 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Cannot connect' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('hcm_token'))).toBe('browser-test-session');
});

test('employee direct admin access and other profile access are blocked', async ({ page }) => {
  await seed(page);
  const calls = await mockApi(page);
  await page.goto('/users');
  await expect(page.getByText('Employee dashboard', { exact: true })).toBeVisible();
  expect(calls.some((call) => call.path === '/users')).toBe(false);
  await page.goto('/employees/aaaaaaaaaaaaaaaaaaaaaaaa');
  await expect(page).toHaveURL(/employees\/me$/);
  expect(calls.some((call) => call.path === '/employees/aaaaaaaaaaaaaaaaaaaaaaaa')).toBe(false);
});

test('ordinary permission failure keeps session', async ({ page }) => {
  await seed(page);
  await mockApi(page, { user: makeUser('HR'), handler: async ({ path, send }) => {
    if (path === '/announcements') { await send(null, 403, 'Permission denied'); return true; }
  } });
  await page.goto('/announcements');
  await expect(page.getByRole('alert')).toContainText('Permission denied');
  expect(await page.evaluate(() => localStorage.getItem('hcm_token'))).toBe('browser-test-session');
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
});

test('CSV import requires fresh successful dry run', async ({ page }) => {
  await seed(page);
  await mockApi(page, { user: makeUser('HR'), handler: async ({ path, body, send }) => {
    if (path === '/employees/import') { await send(body.dryRun ? { valid: true, rowCount: 1, errors: [] } : { imported: 1, items: [{ user: { email: 'new@example.com' }, temporaryPassword: 'one-time-password' }] }); return true; }
  } });
  await page.goto('/employees');
  const button = page.getByRole('button', { name: 'Import', exact: true });
  await expect(button).toBeDisabled();
  await page.getByPlaceholder('Paste CSV').fill('code,email,name,departmentId,designationId,joiningDate,basicSalary\nE1,new@example.com,New,abc,def,2026-01-01,80000');
  await page.getByRole('button', { name: 'Dry run', exact: true }).click();
  await expect(button).toBeEnabled();
  await page.getByPlaceholder('Paste CSV').fill('changed text');
  await expect(button).toBeDisabled();
});

test('smart leave requires explicit confirmation and submits edited allowlisted fields', async ({ page }) => {
  await seed(page);
  const calls = await mockApi(page, { handler: async ({ path, send }) => {
    if (path === '/ai/smart-leave') { await send({ label: 'AI-generated', proposal: { type: 'annual', start: '2027-01-04', end: '2027-01-05', reason: 'Family event' }, requiresConfirmation: true }); return true; }
  } });
  await page.goto('/leave');
  await page.getByPlaceholder('Need next Monday and Tuesday off for my sister’s wedding').fill('Need a break');
  await page.getByRole('button', { name: 'Propose', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirm and submit' })).toBeVisible();
  expect(calls.some((call) => call.path === '/leaves' && call.method === 'POST')).toBe(false);
  await page.getByLabel('Reason', { exact: true }).fill('Updated reason');
  await page.getByRole('button', { name: 'Confirm and submit' }).click();
  await expect(page.getByRole('status')).toContainText('Leave submitted');
  expect(calls.find((call) => call.path === '/leaves' && call.method === 'POST').body).toEqual({ type: 'annual', start: '2027-01-04', end: '2027-01-05', reason: 'Updated reason' });
});

test('current payroll month cannot be finalized', async ({ page }) => {
  await seed(page);
  const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit' }).format(new Date());
  await mockApi(page, { user: makeUser('Admin'), handler: async ({ path, send }) => {
    if (path === '/payroll') { await send([{ _id: personId, month, state: 'draft' }]); return true; }
    if (path === `/payroll/${personId}`) { await send({ _id: personId, month, state: 'draft', slips: [] }); return true; }
  } });
  await page.goto('/payroll');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Finalize', exact: true })).toBeDisabled();
});

for (const width of [375, 768, 1440]) {
  test(`login fits ${width}px viewport`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApi(page);
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`login-${width}.png`), fullPage: true });
  });
}

test('Admin creates an HR login and can copy its one-time password', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await seed(page);
  const calls = await mockApi(page, { user: makeUser('Admin'), handler: async ({ path, body, send }) => {
    if (path === '/users/hr') { await send({ user: { email: body.email }, temporaryPassword: 'private-HR-password' }); return true; }
  } });
  await page.goto('/users');
  await page.getByPlaceholder('HR email').fill('hr@example.com');
  await page.getByRole('button', { name: 'Create HR login' }).click();
  await expect(page.getByText('private-HR-password', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Copy temporary password' }).click();
  await expect(page.getByRole('status')).toContainText('Copied. Share privately');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('private-HR-password');
  expect(calls.find((c) => c.path === '/users/hr').body).toEqual({ email: 'hr@example.com' });
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('private-HR-password');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByText('private-HR-password', { exact: true })).toHaveCount(0);
});

test('HR registers linked employee login with exact registration fields', async ({ page }) => {
  await seed(page);
  const calls = await mockApi(page, { user: makeUser('HR'), handler: async ({ path, request, send }) => {
    if (path === '/employees' && request.method() === 'POST') { await send({ employee: { _id: personId }, user: { email: 'new@example.com' }, temporaryPassword: 'private-employee-password' }); return true; }
  } });
  await page.goto('/employees');
  await expect(page.getByRole('option', { name: 'IT / Engineering', exact: true }).last()).toBeAttached();
  await page.getByLabel('Code', { exact: true }).fill('ENG001');
  await page.getByLabel('Email', { exact: true }).fill('new@example.com');
  await page.getByLabel('Name', { exact: true }).fill('New person');
  await page.getByLabel('Department', { exact: true }).selectOption(personId);
  await page.getByLabel('Designation', { exact: true }).selectOption(org.units[1]._id);
  await page.getByLabel('Basic salary (PKR)', { exact: true }).fill('80000');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await expect(page.getByText('private-employee-password', { exact: true })).toBeVisible();
  const body = calls.find((c) => c.path === '/employees' && c.method === 'POST').body;
  expect(body).toMatchObject({ code: 'ENG001', email: 'new@example.com', name: 'New person', departmentId: personId, designationId: org.units[1]._id, basicSalary: 80000 });
  expect(body).not.toHaveProperty('role');
});

test('employee updates only phone and address with actual profile ID', async ({ page }) => {
  await seed(page);
  const calls = await mockApi(page);
  await page.goto('/profile');
  await expect(page.getByRole('heading', { name: 'Test person', exact: true })).toBeVisible();
  await page.getByLabel('Phone', { exact: true }).fill('03001234567');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Saved');
  expect(calls.find((c) => c.method === 'PATCH').body).toEqual({ phone: '03001234567' });
  expect(calls.find((c) => c.method === 'PATCH').path).toBe(`/employees/${personId}`);
});

test('logout clears session and removes the previous account screen', async ({ page }) => {
  await seed(page);
  const calls = await mockApi(page);
  await page.goto('/');
  await expect(page.getByText('Employee dashboard', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page).toHaveURL(/login$/);
  expect(await page.evaluate(() => localStorage.getItem('hcm_token'))).toBeNull();
  expect(calls.find((c) => c.path === '/auth/logout').body).toEqual({});
  await expect(page.getByText('Employee dashboard', { exact: true })).toHaveCount(0);
});

test('payslip PDF downloads with protected authorization', async ({ page }) => {
  await seed(page);
  const calls = await mockApi(page, { handler: async ({ path, send, route }) => {
    if (path === '/payslips') { await send([{ runId: personId, employeeId: personId, month: '2026-09', netMinor: 123456, state: 'finalized' }]); return true; }
    if (path.endsWith('/pdf')) { await route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.4\n%%EOF' }); return true; }
  } });
  await page.goto('/payslips');
  await expect(page.getByText('PKR 1234.56', { exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PDF', exact: true }).click();
  expect((await downloadPromise).suggestedFilename()).toBe('payslip-2026-09.pdf');
  expect(calls.find((c) => c.path.endsWith('/pdf')).authorization).toBe('Bearer browser-test-session');
});

test('Admin links an employee profile to the existing HR account', async ({ page }) => {
  await seed(page);
  const hr = { ...makeUser('HR'), employeeId: undefined };
  const calls = await mockApi(page, { user: makeUser('Admin'), handler: async ({ path, send }) => {
    if (path === '/users') { await send({ items: [hr], total: 1, page: 1, limit: 20 }); return true; }
    if (path.endsWith('/employee-profile')) { await send({ employee: { _id: personId }, user: { ...hr, employeeId: personId } }); return true; }
  } });
  await page.goto('/users');
  await page.getByRole('button', { name: 'Link profile', exact: true }).click();
  await page.getByLabel('Employee code').fill('HR001');
  await page.getByLabel('Name', { exact: true }).fill('HR person');
  await page.getByLabel('Basic salary (PKR)').fill('90000');
  await page.getByRole('button', { name: 'Create linked profile' }).click();
  await expect(page.getByRole('button', { name: 'Create linked profile' })).toHaveCount(0);
  expect(calls.find((c) => c.path.endsWith('/employee-profile')).body).toMatchObject({ code: 'HR001', email: hr.email, name: 'HR person', basicSalary: 90000, departmentId: personId, designationId: org.units[1]._id });
});

test('HR correction decisions require a comment and send documented body', async ({ page }) => {
  await seed(page);
  const calls = await mockApi(page, { user: makeUser('HR'), handler: async ({ path, send }) => {
    if (path === '/attendance/corrections') { await send({ items: [{ _id: personId, employeeId: 'aaaaaaaaaaaaaaaaaaaaaaaa', date: '2026-10-01', state: 'pending', reason: 'Connection failure' }], total: 1, page: 1, limit: 20 }); return true; }
  } });
  await page.goto('/attendance');
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.locator('.banner.error')).toContainText('HR must comment');
  expect(calls.some((c) => c.path.endsWith('/decision'))).toBe(false);
  await page.getByLabel('Comment required on every decision').fill('Verified with employee');
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect.poll(() => calls.some((c) => c.path.endsWith('/decision'))).toBe(true);
  expect(calls.find((c) => c.path.endsWith('/decision')).body).toEqual({ decision: 'approved', comment: 'Verified with employee' });
});

for (const role of ['Admin', 'HR', 'Employee']) {
  test(`${role} signs in with email and password and receives its own dashboard`, async ({ page }) => {
    const calls = await mockApi(page, { user: makeUser(role) });
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill('person@example.com');
    await page.getByLabel('Password', { exact: true }).fill('my-private-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText(`${role} dashboard`, { exact: true })).toBeVisible();
    expect(calls.find((call) => call.path === '/auth/login').body).toEqual({ email: 'person@example.com', password: 'my-private-password' });
    await expect.poll(() => calls.some((call) => call.path === '/dashboard')).toBe(true);
    expect(calls.find((call) => call.path === '/dashboard').authorization).toBe('Bearer browser-test-session');
    await expect(page.locator('body')).not.toContainText('browser-test-session');
    if (role !== 'Admin') await expect(page.getByRole('link', { name: 'Users', exact: true })).toHaveCount(0);
  });
}

test('workspace password confirmation rejects mismatch without sending setup', async ({ page }) => {
  const calls = await mockApi(page, { initializationRequired: true });
  await page.goto('/setup');
  await page.getByLabel('Company name').fill('Test workspace');
  await page.getByLabel('Admin email').fill('admin@example.com');
  await page.getByLabel('Admin password', { exact: true }).fill('strong-password-123');
  await page.getByLabel('Confirm password', { exact: true }).fill('different-password-123');
  await page.getByRole('button', { name: 'Create workspace', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('passwords do not match');
  expect(calls.some((call) => call.path === '/setup')).toBe(false);
});

test('setup conflict returns to sign-in without a redirect loop', async ({ page }) => {
  await mockApi(page, { initializationRequired: true, handler: async ({ path, send }) => {
    if (path === '/setup') { await send(null, 409, 'Application already initialized'); return true; }
  } });
  await page.goto('/setup');
  await page.getByLabel('Company name').fill('Test workspace');
  await page.getByLabel('Admin email').fill('admin@example.com');
  await page.getByLabel('Admin password', { exact: true }).fill('strong-password-123');
  await page.getByLabel('Confirm password', { exact: true }).fill('strong-password-123');
  await page.getByRole('button', { name: 'Create workspace', exact: true }).click();
  await expect(page).toHaveURL(/login$/);
  await expect(page.getByRole('status')).toContainText('Admin account');
});

test('cold-start setup status recovers after safe GET retries', async ({ page }) => {
  let attempts = 0;
  await mockApi(page, { handler: async ({ path, send }) => {
    if (path === '/setup-status') { attempts++; await send(attempts < 3 ? null : { initializationRequired: true }, attempts < 3 ? 503 : 200); return true; }
  } });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Create Workspace', exact: true })).toBeVisible({ timeout: 10000 });
  expect(attempts).toBe(3);
});

test('all login validation is inline, focuses the first error and preserves credentials', async ({ page }) => {
  const calls = await mockApi(page);
  await page.goto('/login');
  await expect(page.locator('form')).toHaveAttribute('novalidate', '');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByLabel('Email', { exact: true })).toBeFocused();
  await expect(page.getByLabel('Email', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  expect(calls.some(call => call.path === '/auth/login')).toBe(false);
  await page.getByLabel('Email', { exact: true }).fill('person@example.com');
  await page.getByLabel('Password', { exact: true }).fill('x');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Employee dashboard', { exact: true })).toBeVisible();
  expect(calls.find(call => call.path === '/auth/login').body.password).toBe('x');
});

test('setup and login remain mutually accessible before workspace creation', async ({ page }) => {
  await mockApi(page, { initializationRequired: true });
  await page.goto('/');
  await expect(page).toHaveURL(/setup$/);
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/login$/);
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Create Workspace', exact: true }).click();
  await expect(page).toHaveURL(/setup$/);
});

test('backend validation maps to its field and keeps the submitted value', async ({ page }) => {
  await seed(page);
  await mockApi(page, { user: makeUser('Admin'), handler: async ({ path, route }) => {
    if (path === '/users/hr') { await route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Validation failed', errors: [{ field: 'email', reason: 'This address cannot be used.' }] }) }); return true; }
  } });
  await page.goto('/users');
  await page.getByLabel('HR email', { exact: true }).fill('hr@example.com');
  await page.getByRole('button', { name: 'Create HR login' }).click();
  await expect(page.getByLabel('HR email', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('HR email', { exact: true })).toHaveValue('hr@example.com');
  await expect(page.getByLabel('HR email', { exact: true })).toBeFocused();
  await expect(page.locator('.field-error')).toHaveText('This address cannot be used.');
  await page.getByLabel('HR email', { exact: true }).fill('hr2@example.com');
  await expect(page.getByLabel('HR email', { exact: true })).not.toHaveAttribute('aria-invalid', 'true');
});

test('salary and policy forms enforce documented inline business constraints', async ({ page }) => {
  await seed(page);
  const calls = await mockApi(page, { user: makeUser('HR') });
  await page.goto('/employees/me');
  await page.getByLabel('Basic salary (PKR)', { exact: true }).fill('-1');
  await page.getByRole('button', { name: 'Add salary version' }).click();
  await expect(page.getByLabel('Basic salary (PKR)', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  expect(calls.some(call => call.path.endsWith('/salary'))).toBe(false);
});

const routeMatrix = {
  Admin: ['/', '/organization', '/users', '/employees', '/attendance', '/leave', '/payroll', '/payslips', '/announcements', '/notifications', '/audit', '/assistant'],
  HR: ['/', '/organization', '/employees', '/profile', '/attendance', '/leave', '/payroll', '/payslips', '/announcements', '/notifications', '/assistant'],
  Employee: ['/', '/profile', '/attendance', '/leave', '/payslips', '/announcements', '/notifications', '/assistant'],
};
for (const role of ['Admin', 'HR', 'Employee']) for (const width of [375, 768, 1440]) {
  test(`${role} pages render with labels and fit ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(120000);
    await seed(page);
    await mockApi(page, { user: makeUser(role) });
    await page.setViewportSize({ width, height: 900 });
    for (const path of routeMatrix[role]) {
      await page.goto(path);
      await expect(page.locator('main h1')).toBeVisible();
      await expect(page.getByText('Loading workspace records…', { exact: true })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${role} ${path} at ${width}px`).toBe(true);
      const unnamed = await page.locator('main input:not([type=checkbox]), main select, main textarea').evaluateAll(inputs => inputs.filter(input => !input.labels?.length && !input.getAttribute('aria-label')).length);
      expect(unnamed, `Visible control labels on ${role} ${path}`).toBe(0);
      if (path === '/organization' || path === '/attendance' || path === '/profile' || path === '/') await page.screenshot({ path: testInfo.outputPath(`${role}-${width}-${path.replaceAll('/','') || 'dashboard'}.png`), fullPage: true });
    }
    if (width <= 900) {
      await page.getByRole('button', { name: 'Menu', exact: true }).click();
      await expect(page.getByRole('link', { name: 'Dashboard', exact: true })).toBeVisible();
      await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Menu', exact: true })).toHaveAttribute('aria-expanded', 'false');
    } else await expect(page.locator('.menu-toggle')).toBeHidden();
  });
}

test('an old saved account cannot bypass workspace creation when no company exists', async ({ page }) => {
  await seed(page);
  const calls = await mockApi(page, { initializationRequired: true, user: makeUser('Admin') });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Create Workspace', exact: true })).toBeVisible();
  expect(calls.some(call => call.path === '/dashboard')).toBe(false);
});

test('CSV import returns one-time credentials after a successful fresh dry run', async ({ page }) => {
  await seed(page);
  const calls = await mockApi(page, { user: makeUser('HR'), handler: async ({ path, body, send }) => {
    if (path === '/employees/import') { await send(body.dryRun ? { valid: true, rowCount: 1, errors: [] } : { imported: 1, items: [{ user: { email: 'new@example.com' }, temporaryPassword: 'csv-private-password' }] }); return true; }
  } });
  await page.goto('/employees');
  await page.getByLabel('CSV contents').fill('code,email,name,departmentId,designationId,joiningDate,basicSalary\nE1,new@example.com,Person,0123456789abcdef01234567,0123456789abcdef01234569,2026-01-01,80000');
  await page.getByRole('button', { name: 'Dry run', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Import', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('csv-private-password');
  expect(calls.filter(call => call.path === '/employees/import').map(call => call.body.dryRun)).toEqual([true, false]);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('csv-private-password');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('AI fallback stays labeled and announcements render user text safely', async ({ page }) => {
  await seed(page);
  await mockApi(page, { user: makeUser('HR'), handler: async ({ path, request, send }) => {
    if (path === '/ai/chat') { await send({ fallback: true, message: 'The assistant is temporarily unavailable.', label: 'AI-generated' }); return true; }
    if (path === '/announcements' && request.method() === 'GET') { await send({ items: [{ _id: personId, title: 'Office update', body: '<img src=x onerror=alert(1)>', createdAt: '2026-10-01T09:00:00Z' }], total: 1, page: 1, limit: 20 }); return true; }
  } });
  await page.goto('/assistant');
  await page.getByLabel('Your question', { exact: true }).fill('What is the leave policy?');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.locator('.bubble.assistant')).toContainText('AI-generated');
  await expect(page.locator('.bubble.assistant')).toContainText('temporarily unavailable');
  await page.goto('/announcements');
  await expect(page.getByText('<img src=x onerror=alert(1)>', { exact: true })).toBeVisible();
  await expect(page.locator('article img')).toHaveCount(0);
});

test('policy office hours use inline ordered-time validation', async ({ page }) => {
  await seed(page);
  const calls = await mockApi(page, { user: makeUser('Admin') });
  await page.goto('/organization');
  await page.getByLabel('Office end', { exact: true }).fill('08:00');
  await page.getByRole('button', { name: 'Publish policy version', exact: true }).click();
  await expect(page.getByLabel('Office end', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('Office end', { exact: true })).toBeFocused();
  expect(calls.some(call => call.path === '/organization' && call.method === 'PUT')).toBe(false);
});

test('Admin account activation and reset actions show the returned state and one-time password', async ({ page }) => {
  await seed(page);
  const hr = makeUser('HR');
  await mockApi(page, { user: makeUser('Admin'), handler: async ({ path, send }) => {
    if (path === '/users') { await send({ items: [hr], total: 1, page: 1, limit: 20 }); return true; }
    if (path.endsWith('/deactivate') || path.endsWith('/activate')) { hr.active = path.endsWith('/activate'); await send({ user: hr }); return true; }
    if (path.endsWith('/reset')) { await send({ user: hr, temporaryPassword: 'reset-private-password' }); return true; }
  } });
  await page.goto('/users');
  await page.getByRole('button', { name: 'Deactivate', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Activate', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Activate', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Deactivate', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('reset-private-password');
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('reset-private-password');
});

test('Employee attendance defaults use the company timezone supplied by the session', async ({ page }) => {
  await seed(page);
  const user = { ...makeUser(), workspace: { name: 'Company', timezone: 'Pacific/Kiritimati', policies: [{ ...policy, timezone: 'Pacific/Kiritimati' }], units: org.units } };
  let from;
  await mockApi(page, { user, handler: async ({ path, request }) => {
    if (path === '/attendance') from = new URL(request.url()).searchParams.get('from');
  } });
  await page.goto('/attendance');
  await expect(page.getByText('Times shown in Pacific/Kiritimati.', { exact: true })).toBeVisible();
  const expected = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Kiritimati', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  await expect.poll(() => from).toBe(expected);
});

test('workspace creation discards a pre-existing session and still requires fresh sign-in', async ({ page }) => {
  await seed(page);
  const calls = await mockApi(page, { initializationRequired: true, user: makeUser('Admin') });
  await page.goto('/');
  await page.getByLabel('Company name').fill('Fresh company');
  await page.getByLabel('Admin email').fill('new-admin@example.com');
  await page.getByLabel('Admin password', { exact: true }).fill('new-admin-password-123');
  await page.getByLabel('Confirm password', { exact: true }).fill('new-admin-password-123');
  await page.getByRole('button', { name: 'Create workspace', exact: true }).click();
  await expect(page).toHaveURL(/login$/);
  expect(await page.evaluate(() => localStorage.getItem('hcm_token'))).toBeNull();
  expect(calls.some(call => call.path === '/auth/login')).toBe(false);
});

test('directory filter requests keep their form locked until the read completes', async ({ page }) => {
  await seed(page);
  let release;
  await mockApi(page, { user: makeUser('HR'), handler: async ({ path, request, send }) => {
    if (path === '/employees' && new URL(request.url()).searchParams.get('search') === 'Filtered person') {
      await new Promise(resolve => { release = resolve; });
      await send({ items: [], total: 0, page: 1, limit: 20 });
      return true;
    }
  } });
  await page.goto('/employees');
  const search = page.getByLabel('Search employees', { exact: true });
  await search.fill('Filtered person');
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await expect(search).toBeDisabled();
  await expect.poll(() => typeof release).toBe('function');
  release();
  await expect(search).toBeEnabled();
  await expect(search).toHaveValue('Filtered person');
});

test('wrong current password is an inline error and keeps the change-password session', async ({ page }) => {
  await seed(page);
  await mockApi(page, { user: makeUser('HR', true), handler: async ({ path, send }) => {
    if (path === '/auth/change-password') { await send(null, 401, 'Current password is incorrect'); return true; }
  } });
  await page.goto('/change-password');
  await page.getByLabel('Current / temporary password', { exact: true }).fill('wrong-current-password');
  await page.getByLabel('New password', { exact: true }).fill('new-valid-password-123');
  await page.getByLabel('Confirm new password', { exact: true }).fill('new-valid-password-123');
  await page.getByRole('button', { name: 'Update password & sign in again', exact: true }).click();
  await expect(page.getByLabel('Current / temporary password', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('Current / temporary password', { exact: true })).toBeFocused();
  await expect(page).toHaveURL(/change-password$/);
  expect(await page.evaluate(() => localStorage.getItem('hcm_token'))).toBe('browser-test-session');
});

test('employee codes validate allowed punctuation consistently in modern browsers', async ({ page }) => {
  await seed(page);
  await mockApi(page, { user: makeUser('HR') });
  await page.goto('/employees');
  const code = page.getByLabel('Code', { exact: true });
  await code.fill('bad code');
  await page.getByLabel('Name', { exact: true }).click();
  await expect(code).toHaveAttribute('aria-invalid', 'true');
  expect(await code.evaluate(input => input.validity.patternMismatch)).toBe(true);
  await code.fill('ENG_001-02');
  await expect(code).not.toHaveAttribute('aria-invalid', 'true');
  expect(await code.evaluate(input => input.validity.patternMismatch)).toBe(false);
});


test('saved session starts validation alongside setup status', async ({page})=>{
 await seed(page);
 let release;
 const meStarted=new Promise(resolve=>{release=resolve;});
 await mockApi(page,{handler:async({path,send})=>{
  if(path==='/setup-status'){await meStarted;await send({initializationRequired:false,workspaceCreationAvailable:true});return true;}
  if(path==='/auth/me'){release();await send(makeUser());return true;}
 }});
 await page.goto('/');
 await expect(page.getByRole('link',{name:'Profile',exact:true})).toBeVisible();
});

test('profile requires matching passwords, keeps password eyes and submits own allowed fields',async({page})=>{
 await seed(page);
 const calls=await mockApi(page,{handler:async({path,request,send})=>{
  if(path==='/auth/profile'){await send(request.method()==='GET'?{user:makeUser(),employee:{name:'Person',phone:'123',address:'Home'}}:{user:makeUser()});return true;}
 }});
 await page.goto('/profile');
 await expect(page.getByRole('heading',{name:'My profile',exact:true})).toBeVisible();
 await page.getByLabel('Display name',{exact:true}).fill('New name');
 await page.getByLabel('Current password',{exact:true}).fill('correct-password');
 await page.getByLabel('Confirm current password',{exact:true}).fill('different-password');
 await page.getByRole('button',{name:'Update profile',exact:true}).click();
 await expect(page.getByText('The passwords do not match.',{exact:true})).toBeVisible();
 expect(calls.filter(c=>c.path==='/auth/profile'&&c.method==='PATCH')).toHaveLength(0);
 await page.getByLabel('Current password',{exact:true}).fill('correct-password');
 await page.getByLabel('Confirm current password',{exact:true}).fill('correct-password');
 await page.getByRole('button',{name:'Show current password',exact:true}).click();
 await expect(page.getByLabel('Current password',{exact:true})).toHaveValue('correct-password');
 await page.getByRole('button',{name:'Update profile',exact:true}).click();
 await expect(page.getByText('Your profile has been updated.',{exact:true})).toBeVisible();
 expect(calls.find(c=>c.path==='/auth/profile'&&c.method==='PATCH').body).toEqual({displayName:'New name',currentPassword:'correct-password',phone:'123',address:'Home'});
 await expect(page.getByLabel('Current password',{exact:true})).toHaveValue('');
});


test('profile shows account immediately during slow reads and retries failed details without losing session',async({page})=>{
 await seed(page);
 let release,requests=0;
 const waiting=new Promise(resolve=>{release=resolve;});
 await mockApi(page,{handler:async({path,send})=>{
  if(path==='/auth/profile') {requests++;if(requests===1){await waiting;await send(null,503,'Profile service unavailable');}else await send({user:makeUser(),employee:{name:'Person',phone:'123'}});return true;}
 }});
 await page.goto('/profile');
 await expect(page.getByRole('heading',{name:'My profile',exact:true})).toBeVisible();
 await expect(page.locator('.profile-summary')).toContainText('person@example.com');
 await expect(page.getByRole('link',{name:'Open my profile',exact:true})).toBeVisible();
 await expect(page.locator('.nav a[href="/profile"]')).toHaveCount(0);
 release();
 await expect(page.getByText('Profile service unavailable',{exact:true})).toBeVisible();
 expect(requests).toBe(1);
 await page.getByRole('button',{name:'Try again',exact:true}).click();
 await expect(page.getByLabel('Display name',{exact:true})).toHaveValue('Person');
 expect(await page.evaluate(()=>localStorage.getItem('hcm_token'))).toBe('browser-test-session');
 await page.screenshot({path:test.info().outputPath('profile-desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await expect.poll(()=>page.locator('.sidebar').evaluate(el=>el.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
 await page.screenshot({path:test.info().outputPath('profile-mobile.png'),fullPage:true});
});
