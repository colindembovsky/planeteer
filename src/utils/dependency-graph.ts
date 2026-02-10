import type { Task } from '../models/plan.js';

export interface BatchResult {
  batches: string[][];
  hasCycle: boolean;
}

/**
 * Detect cycles in the task dependency graph using DFS.
 * Returns the IDs involved in a cycle, or empty array if none.
 */
export function detectCycles(tasks: Task[]): string[] {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const cycleNodes: string[] = [];

  function dfs(id: string): boolean {
    if (inStack.has(id)) {
      cycleNodes.push(id);
      return true;
    }
    if (visited.has(id)) return false;
    visited.add(id);
    inStack.add(id);

    const task = taskMap.get(id);
    if (task) {
      for (const dep of task.dependsOn) {
        if (dfs(dep)) {
          cycleNodes.push(id);
          return true;
        }
      }
    }

    inStack.delete(id);
    return false;
  }

  for (const task of tasks) {
    if (!visited.has(task.id)) {
      dfs(task.id);
    }
  }

  return cycleNodes;
}

/**
 * Compute parallel execution batches via topological sort.
 * Each batch contains tasks whose dependencies are all in prior batches.
 */
export function computeBatches(tasks: Task[]): BatchResult {
  const cycles = detectCycles(tasks);
  if (cycles.length > 0) {
    return { batches: [], hasCycle: true };
  }

  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const completed = new Set<string>();
  const remaining = new Set(tasks.map((t) => t.id));
  const batches: string[][] = [];

  while (remaining.size > 0) {
    const batch: string[] = [];

    for (const id of remaining) {
      const task = taskMap.get(id)!;
      const depsReady = task.dependsOn.every((dep) => completed.has(dep));
      if (depsReady) {
        batch.push(id);
      }
    }

    if (batch.length === 0) {
      return { batches, hasCycle: true };
    }

    for (const id of batch) {
      remaining.delete(id);
      completed.add(id);
    }

    batches.push(batch);
  }

  return { batches, hasCycle: false };
}

/**
 * Get tasks that are ready to execute (all deps done).
 */
export function getReadyTasks(tasks: Task[]): Task[] {
  const doneIds = new Set(tasks.filter((t) => t.status === 'done').map((t) => t.id));
  return tasks.filter(
    (t) =>
      t.status === 'pending' &&
      t.dependsOn.every((dep) => doneIds.has(dep)),
  );
}
