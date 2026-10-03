import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lifepilot-test-'));
process.env.LIFEPILOT_TASK_FILE = path.join(directory, 'tasks.json');
const { taskStore, addStoredTask, completeStoredTask, syncTaskChanges } = await import('../dist/task-store.js');

test('browser and MCP share persisted tasks without replacing unrelated work', () => {
  try {
    const mcpTask = addStoredTask({ task: 'Call a mechanic', priority: 'high', dueDate: null });
    assert.equal(JSON.parse(fs.readFileSync(process.env.LIFEPILOT_TASK_FILE))[0].id, mcpTask.id);
    const browserTask = { id: 'browser-1', task: 'Arrange a ride', priority: 'medium', dueDate: null, completed: false, createdAt: new Date().toISOString(), planId: 'plan-1' };
    syncTaskChanges({ added: [browserTask], updated: [], deleted: [] });
    completeStoredTask(mcpTask.id);
    syncTaskChanges({ added: [browserTask], updated: [{ id: mcpTask.id, changes: { priority: 'low' } }], deleted: [] });
    assert.equal(taskStore.length, 2);
    assert.equal(taskStore[0].completed, true);
    assert.equal(taskStore[0].priority, 'low');
    assert.equal(taskStore[1].planId, 'plan-1');
    const persisted = JSON.parse(fs.readFileSync(process.env.LIFEPILOT_TASK_FILE));
    assert.deepEqual(persisted, taskStore);
    syncTaskChanges({ added: [browserTask], updated: [], deleted: [browserTask.id] });
    assert.equal(taskStore.length, 1);
    assert.throws(() => syncTaskChanges({ added: [{ ...browserTask, task: '' }], updated: [], deleted: [] }));
    assert.equal(taskStore.length, 1);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
