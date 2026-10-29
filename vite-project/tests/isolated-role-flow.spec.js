import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';

const root = process.env.HCM_BACKEND_ROOT;
test.skip(!root, 'Set HCM_BACKEND_ROOT to run against a disposable local backend/database.');
let replica, child, backend;
let startupOutput = '';
const password = 'Isolated-test-password-123!';

test.beforeAll(async () => {
  test.setTimeout(90000);
  if (!root) return;
  const requireBackend = createRequire(join(root, 'package.json'));
  const { MongoMemoryReplSet } = requireBackend('mongodb-memory-server');
  const binary = join(root, 'tmp', 'mongodb', 'mongod.exe');
  replica = await MongoMemoryReplSet.create({ binary: { version: '7.0.24', ...(existsSync(binary) ? { systemBinary: binary } : {}) }, replSet: { count: 1, storageEngine: 'wiredTiger' } });
  const probe = createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  backend = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['server.js'], { cwd: root, windowsHide: true, stdio: ['ignore','pipe','pipe'], env: { ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'silent', PORT: String(port), MONGODB_URI: replica.getUri('browser_role_flow_isolated'), JWT_SECRET: 'browser-flow-test-secret-32-characters-only', CORS_ORIGINS: 'http://127.0.0.1:5174', AI_API_KEY: '' } });
  const recordStartup = chunk => { startupOutput = (startupOutput + chunk.toString()).slice(-8000); };
  child.stdout.on('data', recordStartup);
  child.stderr.on('data', recordStartup);
  await expect.poll(async () => {
    if (child.exitCode !== null) throw new Error(`Disposable backend exited (${child.exitCode}): ${startupOutput}`);
    try { return (await fetch(`${backend}/ready`, { signal: AbortSignal.timeout(3000) })).status; } catch { return 0; }
  }, { timeout: 60000 }).toBe(200);
});
test.afterAll(async () => {
  if (child && child.exitCode === null) await new Promise(resolve => { child.once('exit', resolve); child.kill(); });
  if (replica) await replica.stop();
});

test('isolated full role lifecycle through actual frontend and backend', async ({ page }) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => { throw error; });
  // Every remote API call is redirected to the disposable local process, including mutations.
  await page.route('https://hackathon-backend-d180.onrender.com/**', async route => {
    const target = new URL(route.request().url());
    try {
      const response = await route.fetch({ url: backend + target.pathname + target.search, maxRetries: 0 });
      await route.fulfill({ response });
    } catch {
      throw new Error(`Disposable backend request did not complete: ${route.request().method()} ${target.pathname}`);
    }
  });
  const signIn = async (email, secret) => {
    await page.getByLabel('Workspace address', { exact: true }).fill('browser-company');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(secret);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  };
  const changePassword = async temporary => {
    await expect(page).toHaveURL(/change-password$/);
    await page.getByLabel('Current / temporary password', { exact: true }).fill(temporary);
    await page.getByLabel('New password', { exact: true }).fill(password);
    await page.getByLabel('Confirm new password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Update password & sign in again', exact: true }).click();
    await expect(page).toHaveURL(/login$/, { timeout: 20000 });
  };
  const logout = async () => {
    await page.getByRole('button', { name: 'Log out', exact: true }).click();
    await expect(page).toHaveURL(/login$/);
  };
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Create Workspace', exact: true })).toBeVisible();
  await page.getByLabel('Company name').fill('Disposable Browser Company');
  await page.getByLabel('Workspace address', { exact: true }).fill('browser-company');
  await page.getByLabel('Admin email').fill('admin@isolated.example');
  await page.getByLabel('Admin password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create workspace', exact: true }).click();
  await expect(page).toHaveURL(/login$/);
  await signIn('admin@isolated.example', password);
  await expect(page.getByText('Admin dashboard', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Organization', exact: true }).click();
  await expect(page.getByLabel('Company name')).toHaveValue('Disposable Browser Company');
  const unitForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Add unit', exact: true }) });
  await unitForm.getByLabel('Unit name', { exact: true }).selectOption('IT / Engineering');
  await unitForm.getByRole('button', { name: 'Add unit', exact: true }).click();
  await expect(page.getByLabel('Rename IT / Engineering', { exact: true })).toBeVisible();
  await unitForm.getByLabel('Unit type', { exact: true }).selectOption('designation');
  await unitForm.getByPlaceholder('Name').fill('Engineer');
  await unitForm.getByRole('button', { name: 'Add unit', exact: true }).click();
  await expect(page.locator('input[value="Engineer"]')).toBeVisible();
  await page.getByRole('link', { name: 'Users', exact: true }).click();
  await page.getByPlaceholder('HR email').fill('hr@isolated.example');
  await page.getByRole('button', { name: 'Create HR login', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Temporary password', exact: true })).toBeVisible();
  const hrTemporary = await page.locator('.modal code').innerText();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Link profile', exact: true }).click();
  await page.getByLabel('Employee code').fill('HR001');
  await page.getByLabel('Name', { exact: true }).fill('Isolated HR');
  await page.getByLabel('Basic salary (PKR)').fill('90000');
  await page.getByRole('button', { name: 'Create linked profile' }).click();
  await expect(page.getByRole('button', { name: 'Create linked profile' })).toHaveCount(0);
  await logout();
  await signIn('hr@isolated.example', hrTemporary);
  await changePassword(hrTemporary);
  await signIn('hr@isolated.example', password);
  await expect(page.getByText('HR dashboard', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Employees', exact: true }).click();
  await page.getByLabel('Code', { exact: true }).fill('EMP001');
  await page.getByLabel('Email', { exact: true }).fill('employee@isolated.example');
  await page.getByLabel('Name', { exact: true }).fill('Isolated Employee');
  await page.getByLabel('Department', { exact: true }).selectOption({ label: 'IT / Engineering' });
  await page.getByLabel('Designation', { exact: true }).selectOption({ label: 'Engineer' });
  await page.getByLabel('Basic salary (PKR)').fill('80000');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Temporary credentials', exact: true })).toBeVisible();
  const employeeTemporary = await page.locator('.modal code').innerText();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await logout();
  await signIn('employee@isolated.example', employeeTemporary);
  await changePassword(employeeTemporary);
  await signIn('employee@isolated.example', password);
  await expect(page.getByText('Employee dashboard', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Users', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('Employee dashboard', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Profile', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Isolated Employee', exact: true })).toBeVisible();
  await page.getByLabel('Phone', { exact: true }).fill('03001234567');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.banner.ok')).toContainText('Saved');
  await page.reload();
  await expect(page.getByLabel('Phone', { exact: true })).toHaveValue('03001234567');
  await page.getByRole('link', { name: 'Leave', exact: true }).click();
  const next = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) + 'T12:00:00Z');
  do { next.setUTCDate(next.getUTCDate() + 1); } while ([0, 6].includes(next.getUTCDay()));
  const leaveDate = next.toISOString().slice(0, 10);
  await page.getByLabel('Type', { exact: true }).selectOption('annual');
  await page.getByLabel('Start', { exact: true }).fill(leaveDate);
  await page.getByLabel('End', { exact: true }).fill(leaveDate);
  await page.getByLabel('Reason', { exact: true }).fill('Family event');
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(page.locator('.banner.ok')).toContainText('Leave submitted');
  await logout();
  await signIn('hr@isolated.example', password);
  await expect(page.getByText('HR dashboard', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Leave', exact: true }).click();
  await page.getByLabel('Comment on every decision', { exact: true }).fill('Approved for the requested day');
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Announcements', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Team update');
  await page.getByLabel('Body', { exact: true }).fill('Please review the new office schedule.');
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(page.locator('.banner.ok')).toContainText('Announcement published');
  await expect(page.getByRole('heading', { name: 'Team update', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'AI assistant', exact: true }).click();
  await page.getByLabel('Your question', { exact: true }).fill('What are the leave rules?');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.locator('.bubble.assistant')).toBeVisible();
  await expect(page.locator('.bubble.assistant')).toContainText('AI-generated');
  await page.screenshot({ path: 'isolated-test-results/verified-hr-assistant.png', fullPage: true });

  await logout();
  await page.getByRole('link', { name: 'Create Workspace', exact: true }).click();
  await page.getByLabel('Company name', { exact: true }).fill('Second Independent Company');
  await page.getByLabel('Workspace address', { exact: true }).fill('second-company');
  await page.getByLabel('Admin email', { exact: true }).fill('admin@isolated.example');
  await page.getByLabel('Admin password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create workspace', exact: true }).click();
  await expect(page).toHaveURL(/login$/);
  await page.getByLabel('Workspace address', { exact: true }).fill('second-company');
  await page.getByLabel('Email', { exact: true }).fill('admin@isolated.example');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Admin dashboard', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Organization', exact: true }).click();
  await expect(page.getByLabel('Company name', { exact: true })).toHaveValue('Second Independent Company');
  await expect(page.getByLabel('Rename IT / Engineering', { exact: true })).toHaveCount(0);
  await logout();
  await signIn('admin@isolated.example', password);
  await page.getByRole('link', { name: 'Organization', exact: true }).click();
  await expect(page.getByLabel('Company name', { exact: true })).toHaveValue('Disposable Browser Company');
  await expect(page.getByLabel('Rename IT / Engineering', { exact: true })).toBeVisible();

});
