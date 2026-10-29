import { chromium } from '@playwright/test';

// Explicit, read-only live check. Never submits credentials or creates records.
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  await page.goto('http://localhost:5173/login');
  await page.getByRole('heading', { name: 'Sign in', exact: true }).waitFor({ timeout: 180000 });
  const status = await page.evaluate(async () => {
    const r = await fetch('https://hackathon-backend-d180.onrender.com/api/v1/setup-status', { credentials: 'omit' });
    return { origin: location.origin, status: r.status, data: (await r.json()).data };
  });
  console.log(JSON.stringify(status));
  await page.getByRole('link', { name: 'Create Workspace', exact: true }).click();
  console.log(JSON.stringify({ creationPageVisible: await page.getByRole('heading', { name: 'Create Workspace', exact: true }).isVisible(), companyFormVisible: await page.getByLabel('Company name', { exact: true }).count(), deploymentRequired: await page.getByText(/requires deploying the workspace backend update/).isVisible() }));
} finally { await browser.close(); }
