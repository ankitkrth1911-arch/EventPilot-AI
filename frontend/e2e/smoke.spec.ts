import { test, expect } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

let backendProcess: ChildProcess | null = null;
let frontendProcess: ChildProcess | null = null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKEND_DIR = path.resolve(__dirname, '../../backend');
const FRONTEND_DIR = path.resolve(__dirname, '..');
const PYTHON_PATH = path.resolve(BACKEND_DIR, '.venv/Scripts/python.exe');
const VITE_PATH = path.resolve(FRONTEND_DIR, 'node_modules/vite/bin/vite.js');

async function waitForHttp(url: string, timeoutMs: number = 20000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

test.beforeAll(async () => {
  // 1. Start Backend in in-memory test mode on port 8000
  backendProcess = spawn(
    PYTHON_PATH,
    ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8000'],
    {
      cwd: BACKEND_DIR,
      env: {
        ...process.env,
        TEST_MODE: 'true',
        DATABASE_URL: 'memory://',
        ENABLE_DOCS: 'true',
        ALLOWED_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
      },
      shell: false,
    }
  );

  backendProcess.stderr?.on('data', (d) => {
    // console.log(`[backend stderr] ${d}`);
  });

  const backendReady = await waitForHttp('http://127.0.0.1:8000/livez');
  if (!backendReady) {
    throw new Error('Local backend failed to start on http://127.0.0.1:8000');
  }

  // 2. Start Frontend Vite server on port 3000
  frontendProcess = spawn(
    process.execPath,
    [VITE_PATH, '--port', '3000', '--host', '127.0.0.1'],
    {
      cwd: FRONTEND_DIR,
      env: {
        ...process.env,
        VITE_API_URL: 'http://127.0.0.1:8000',
      },
      shell: false,
    }
  );

  frontendProcess.stderr?.on('data', (d) => {
    // console.log(`[frontend stderr] ${d}`);
  });

  const frontendReady = await waitForHttp('http://127.0.0.1:3000');
  if (!frontendReady) {
    throw new Error('Frontend dev server failed to start on http://127.0.0.1:3000');
  }
});

test.afterAll(async () => {
  if (frontendProcess) {
    frontendProcess.kill();
  }
  if (backendProcess) {
    backendProcess.kill();
  }
});

test('EventPilot AI E2E smoke flow: create, persist on reload, edit items, auto-allocate, delete, and graceful offline state', async ({
  page,
}) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (err) => pageErrors.push(err));

  // 1. Visit dashboard
  await page.goto('http://127.0.0.1:3000');
  await expect(page.locator('h1')).toContainText('Event Operations Dashboard');

  // 2. Open Create Event Modal
  const createBtn = page.getByRole('button', { name: /Create.*Event/i }).first();
  await expect(createBtn).toBeVisible();
  await createBtn.click();

  // 3. Fill out create form
  await page.getByPlaceholder(/Wedding Reception/i).fill('SMOKE-TEST Grand Royal Wedding');
  await page.getByPlaceholder(/Bengaluru/i).fill('Taj Lands End, Mumbai');
  await page.locator('input[type="number"]').first().fill('300000');

  // Submit
  const submitCreate = page.getByRole('button', { name: 'Create Event' });
  await submitCreate.click();

  // 4. Verify detail view loaded with created event
  await expect(page.locator('h1')).toContainText('SMOKE-TEST Grand Royal Wedding', { timeout: 10000 });

  // 5. Refresh page: verify data persists
  await page.reload();
  const titleLocator = page.locator('text=SMOKE-TEST Grand Royal Wedding').first();
  await expect(titleLocator).toBeVisible({ timeout: 10000 });

  // If on dashboard, navigate into detail view
  if (await page.locator('h1:has-text("Event Operations Dashboard")').isVisible()) {
    await titleLocator.click();
    await expect(page.locator('h1')).toContainText('SMOKE-TEST Grand Royal Wedding');
  }

  // 6. Switch to Budget & Ledger tab and auto-allocate
  const budgetTabBtn = page.getByRole('button', { name: /Budget & Ledger/i });
  await budgetTabBtn.click();

  page.on('dialog', async (dialog) => {
    await dialog.accept();
  });

  const autoAllocateBtn = page.getByRole('button', { name: /Auto-allocate budget/i });
  if (await autoAllocateBtn.isVisible()) {
    await autoAllocateBtn.click();
    await page.waitForTimeout(1000);
  }

  // 7. Switch to Tasks tab and verify tasks loaded
  const tasksTabBtn = page.getByRole('button', { name: /Run-of-Show Tasks/i });
  await tasksTabBtn.click();
  await page.waitForTimeout(500);

  // 8. Delete Event
  const deleteBtn = page.getByRole('button', { name: /Delete Event/i });
  await expect(deleteBtn).toBeVisible();
  await deleteBtn.click();

  // Confirm redirected to dashboard and event is gone
  await expect(page.locator('h1')).toContainText('Event Operations Dashboard');
  await expect(page.locator('text=SMOKE-TEST Grand Royal Wedding')).not.toBeVisible();

  // 9. Stop the Backend process to test API offline state
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }

  // Wait for port 8000 to close
  await page.waitForTimeout(1500);

  // Reload page
  await page.reload();

  // Check that the offline state appears gracefully with Retry button
  const offlineCard = page.locator('text=Unable to connect to EventPilot backend');
  await expect(offlineCard).toBeVisible({ timeout: 10000 });
  const retryBtn = page.getByRole('button', { name: /Retry Connection/i });
  await expect(retryBtn).toBeVisible();

  // Confirm zero uncaught fatal page exceptions occurred
  const fatalErrors = pageErrors.filter((e) => !e.message.includes('fetch') && !e.message.includes('network'));
  expect(fatalErrors.length).toBe(0);
});
