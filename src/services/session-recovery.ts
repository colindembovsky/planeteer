import type { Plan, Task } from '../models/plan.js';
import { listSessions, deleteSession } from './copilot.js';

export interface OrphanedSessionInfo {
  taskId: string;
  sessionId: string;
  task: Task;
  sessionModifiedTime: Date;
}

/**
 * Detect tasks with sessionIds that may have orphaned sessions.
 * Returns tasks that are marked as in_progress with session IDs.
 */
export async function detectOrphanedSessions(plan: Plan): Promise<OrphanedSessionInfo[]> {
  // Find tasks that were in progress (interrupted)
  const tasksWithSessions = plan.tasks.filter(
    (t) => t.status === 'in_progress' && t.sessionId
  );

  if (tasksWithSessions.length === 0) {
    return [];
  }

  try {
    // Get all available sessions from the SDK
    const allSessions = await listSessions();
    const sessionMap = new Map(allSessions.map((s) => [s.sessionId, s]));

    // Find orphaned sessions
    const orphaned: OrphanedSessionInfo[] = [];
    for (const task of tasksWithSessions) {
      if (!task.sessionId) continue;
      
      const session = sessionMap.get(task.sessionId);
      if (session) {
        orphaned.push({
          taskId: task.id,
          sessionId: task.sessionId,
          task,
          sessionModifiedTime: session.modifiedTime,
        });
      }
    }

    return orphaned;
  } catch (err) {
    // If we can't list sessions, assume no orphaned sessions
    console.error('Failed to list sessions:', err);
    return [];
  }
}

/**
 * Cleanup orphaned sessions by deleting them from the SDK.
 */
export async function cleanupOrphanedSessions(orphanedSessions: OrphanedSessionInfo[]): Promise<void> {
  for (const orphaned of orphanedSessions) {
    try {
      await deleteSession(orphaned.sessionId);
    } catch (err) {
      console.error(`Failed to delete session ${orphaned.sessionId}:`, err);
    }
  }
}

/**
 * Mark interrupted tasks as interrupted status.
 */
export function markTasksAsInterrupted(plan: Plan, orphanedSessions: OrphanedSessionInfo[]): Plan {
  const taskIdsToMark = new Set(orphanedSessions.map((o) => o.taskId));
  
  return {
    ...plan,
    tasks: plan.tasks.map((t) =>
      taskIdsToMark.has(t.id) ? { ...t, status: 'interrupted' as const } : t
    ),
  };
}
