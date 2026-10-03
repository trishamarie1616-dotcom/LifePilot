import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lifepilot-browser-'));
const taskFile = path.join(directory, 'tasks.json');
const port = 3107;
let server;
const start = () => {
  server = spawn(process.execPath, ['dist/main.js'], { env: { ...process.env, PORT: String(port), LIFEPILOT_TASK_FILE: taskFile, OPENAI_API_KEY: '' }, stdio: 'inherit' });
};
const stop = async () => {
  if (server.exitCode !== null) return;
  await new Promise(resolve => { server.once('exit', resolve); server.kill(); });
};
async function ready() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await fetch(`http://localhost:${port}/api/tasks`)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Server did not start');
}
const initial = { goal: 'Get to work Monday within $300', context: 'You need reliable transportation while assessing repairs.', tasks: ['Call a mechanic', 'Arrange a ride'], nextSteps: ['Call a mechanic for an inspection estimate'], followups: ['Review the quote before approving repairs'], informationNeeded: ['How far is your commute?'] };
let revisionSeen = false;
let browser;
try {
  start(); await ready();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/plan', async route => {
    const input = route.request().postDataJSON();
    if (input.revision) {
      revisionSeen = true;
      assert.match(input.revision.originalRequest, /\$300/);
      assert.deepEqual(input.revision.completedTasks, ['Call a mechanic']);
      assert.equal(input.request, 'My budget dropped to $100. My commute is 5 miles.');
      await route.fulfill({ json: { ...initial, goal: 'Get to work Monday within $100', tasks: ['Arrange a ride', 'Ask about a carpool'], informationNeeded: [] } });
    } else await route.fulfill({ json: initial });
  });
  await page.goto(`http://localhost:${port}`);
  await page.locator('#taskSyncStatus').filter({ hasText: 'Tasks synced' }).waitFor();
  await page.locator('#userInput').fill('My car broke down. I have $300 and need to get to work Monday.');
  await page.locator('#submitBtn').click();
  await page.locator('#planInformation').filter({ hasText: 'How far is your commute?' }).waitFor();
  await page.locator('#addPlanTasksBtn').click();
  await page.waitForFunction(async () => (await (await fetch('/api/tasks')).json()).tasks.length === 2);
  await page.locator('#tasksList .task-item').filter({ hasText: 'Call a mechanic' }).locator('.task-checkbox').check();
  await page.waitForFunction(async () => (await (await fetch('/api/tasks')).json()).tasks.some(task => task.task === 'Call a mechanic' && task.completed));
  assert.equal(await page.locator('#progressCount').innerText(), '1 of 2 completed');
  await page.locator('#savePlanBtn').click();
  await page.locator('#savePlanBtn').click();
  assert.equal(await page.locator('.saved-plan').count(), 1);
  await page.locator('#planUpdate').fill('My budget dropped to $100. My commute is 5 miles.');
  await page.locator('#revisePlanBtn').click();
  await page.locator('#planGoal').filter({ hasText: '$100' }).waitFor();
  assert.equal(revisionSeen, true);
  assert.equal(await page.locator('#tasksList .completed').count(), 1);
  await page.locator('#addPlanTasksBtn').click();
  await page.waitForFunction(async () => (await (await fetch('/api/tasks')).json()).tasks.length === 3);
  await page.locator('#addPlanTasksBtn').click();
  assert.equal(await page.locator('#tasksList .task-item').count(), 3);
  assert.equal(await page.locator('#taskCount').innerText(), '3');
  fs.mkdirSync('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/dashboard-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: 'artifacts/dashboard-mobile.png', fullPage: true });
  await page.reload();
  await page.locator('#taskSyncStatus').filter({ hasText: 'Tasks synced' }).waitFor();
  assert.equal(await page.locator('#tasksList .task-item').count(), 3);
  assert.equal(await page.locator('#tasksList .completed').count(), 1);
  assert.equal(await page.locator('.saved-plan').count(), 1);
  await stop(); start(); await ready();
  const persisted = await (await fetch(`http://localhost:${port}/api/tasks`)).json();
  assert.equal(persisted.tasks.length, 3);
  assert.equal(persisted.tasks.filter(task => task.completed).length, 1);
  const mcp = async (body) => {
    const response = await fetch(`http://localhost:${port}/mcp`, { method: 'POST', headers: { 'Content-Type':'application/json', Accept:'application/json, text/event-stream' }, body: JSON.stringify(body) });
    assert.equal(response.ok, true);
    const text = await response.text();
    return text.startsWith('{') ? JSON.parse(text) : JSON.parse(text.split('\n').find(line => line.startsWith('data: ')).slice(6));
  };
  const initialized = await mcp({ jsonrpc:'2.0', id:0, method:'initialize', params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'LifePilot contest verification',version:'1.0.0'}} });
  assert.equal(initialized.result.protocolVersion, '2025-11-25');
  assert.ok(initialized.result.capabilities.tools);
  const tools = await mcp({ jsonrpc:'2.0', id:1, method:'tools/list', params:{} });
  assert.ok(tools.result.tools.some(tool => tool.name === 'generate-plan'));
  const listed = await mcp({ jsonrpc:'2.0', id:2, method:'tools/call', params:{name:'list-tasks',arguments:{}} });
  assert.equal(listed.result.structuredContent.tasks.length, 3);
  await mcp({ jsonrpc:'2.0', id:3, method:'tools/call', params:{name:'complete-task',arguments:{task:'Arrange a ride'}} });
  await page.reload();
  await page.locator('#taskSyncStatus').filter({ hasText: 'Tasks synced' }).waitFor();
  assert.equal(await page.locator('#tasksList .completed').count(), 2);
  const oversizedParserProbe = { name: 'large.pdf', mimeType: 'application/pdf', dataUrl: 'data:application/pdf;base64,' + Buffer.from('%PDF-' + ' '.repeat(150000)).toString('base64') };
  const accepted = await fetch(`http://localhost:${port}/api/ask`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ question:'Explain this file', attachments:[oversizedParserProbe] }) });
  assert.equal(accepted.status, 503, 'Valid uploads over 100 KB must reach key validation');
  let attachmentsSeen = false;
  await page.route('**/api/ask', async route => {
    const input = route.request().postDataJSON();
    assert.equal(input.attachments.length, 2);
    assert.equal(input.attachments[0].mimeType, 'image/png');
    assert.equal(input.attachments[1].name, 'quote.pdf');
    assert.ok(input.attachments[1].dataUrl.startsWith('data:application/pdf;base64,'));
    attachmentsSeen = true;
    await route.fulfill({ json: { answer:'The quote lists a repair estimate.', explanation:'Confirm the scope before approving.', uncertainties:[], recommendedActions:['Ask for an itemized quote'], followUpQuestions:[] } });
  });
  await page.getByRole('button', { name:'AI Assistant' }).click();
  await page.locator('#fileUpload').setInputFiles({ name:'notes.docx', mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer:Buffer.from('unsupported') });
  await page.locator('#attachmentStatus').filter({ hasText:'Export other documents as PDF' }).waitFor();
  const photo = { name:'photo.png', mimeType:'image/png', buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') };
  const pdf = { name:'quote.pdf', mimeType:'application/pdf', buffer:Buffer.from('%PDF-1.4\nexample') };
  await page.locator('#fileUpload').setInputFiles([photo,pdf]);
  await page.locator('#attachmentStatus').filter({ hasText:'Ready.' }).waitFor();
  assert.equal(await page.locator('#attachmentList li').count(), 2);
  await page.getByRole('button', { name:'Remove quote.pdf', exact:true }).click();
  assert.equal(await page.locator('#attachmentList li').count(), 1);
  await page.locator('#fileUpload').setInputFiles(pdf);
  await page.locator('#attachmentStatus').filter({ hasText:'Ready.' }).waitFor();
  await page.locator('#aiQuestion').fill('What does this repair quote say?');
  await page.locator('#askLifePilotBtn').click();
  await page.locator('#aiAnswer').filter({ hasText:'The quote lists a repair estimate.' }).waitFor();
  assert.equal(attachmentsSeen, true);
  await page.screenshot({ path:'artifacts/attachments-mobile.png',fullPage:true });
  assert.deepEqual(errors, []);
  console.log('Browser workflow, revisions, duplicate prevention, mobile overflow, restart persistence and MCP sync passed.');
} finally {
  if (browser) await browser.close();
  if (server) await stop();
  fs.rmSync(directory, { recursive: true, force: true });
}

