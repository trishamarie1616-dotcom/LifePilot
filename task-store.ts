import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

export const storedTaskSchema = z.object({
  id: z.string().min(1).max(100), task: z.string().trim().min(1).max(1500),
  priority: z.enum(['low', 'medium', 'high']), dueDate: z.string().max(100).nullable(),
  completed: z.boolean(), createdAt: z.string(), planId: z.string().max(100).optional()
});
export type StoredTask = z.infer<typeof storedTaskSchema>;
const taskFile = path.resolve(process.env.LIFEPILOT_TASK_FILE || 'data/tasks.json');
export const taskStore: StoredTask[] = fs.existsSync(taskFile)
  ? z.array(storedTaskSchema).parse(JSON.parse(fs.readFileSync(taskFile, 'utf8'))) : [];

function transaction<T>(change: () => T): T {
  const before = structuredClone(taskStore);
  try {
    const result = change();
    fs.mkdirSync(path.dirname(taskFile), { recursive: true });
    fs.writeFileSync(taskFile + '.tmp', JSON.stringify(taskStore, null, 2));
    fs.renameSync(taskFile + '.tmp', taskFile);
    return result;
  } catch (error) {
    taskStore.splice(0, taskStore.length, ...before);
    throw error;
  }
}

export function addStoredTask(input: Omit<StoredTask, 'id' | 'createdAt' | 'completed'>): StoredTask {
  const stored = storedTaskSchema.parse({ ...input, id: randomUUID(), completed: false, createdAt: new Date().toISOString() });
  return transaction(() => { taskStore.push(stored); return stored; });
}

export function completeStoredTask(identifier: string): StoredTask | undefined {
  const found = taskStore.find(task => task.id.toLowerCase() === identifier.toLowerCase() || task.task.toLowerCase() === identifier.toLowerCase());
  if (!found) return undefined;
  return transaction(() => { found.completed = true; return found; });
}

export const taskChangesSchema = z.object({
  added: z.array(storedTaskSchema).max(500),
  updated: z.array(z.object({ id: z.string().max(100), changes: storedTaskSchema.pick({ task: true, priority: true, dueDate: true, completed: true }).partial() })).max(500),
  deleted: z.array(z.string().max(100)).max(500)
});
export function syncTaskChanges(input: unknown): StoredTask[] {
  const changes = taskChangesSchema.parse(input);
  return transaction(() => {
    for (const task of changes.added) {
      if (!taskStore.some(existing => existing.id === task.id)) taskStore.push(task);
    }
    for (const update of changes.updated) {
      const found = taskStore.find(task => task.id === update.id);
      if (found) Object.assign(found, update.changes);
    }
    for (const id of changes.deleted) {
      const index = taskStore.findIndex(task => task.id === id);
      if (index >= 0) taskStore.splice(index, 1);
    }
    return structuredClone(taskStore);
  });
}
