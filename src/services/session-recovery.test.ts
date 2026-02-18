import { describe, it, expect, beforeEach } from 'vitest';
import type { Plan, Task } from '../models/plan.js';
import { markTasksAsInterrupted } from '../services/session-recovery.js';
import type { OrphanedSessionInfo } from '../services/session-recovery.js';

describe('session-recovery', () => {
  let samplePlan: Plan;
  let sampleTask1: Task;
  let sampleTask2: Task;
  let sampleTask3: Task;

  beforeEach(() => {
    sampleTask1 = {
      id: 'task-1',
      title: 'Task 1',
      description: 'First task',
      acceptanceCriteria: ['Criterion 1'],
      dependsOn: [],
      status: 'in_progress',
      sessionId: 'session-123',
    };

    sampleTask2 = {
      id: 'task-2',
      title: 'Task 2',
      description: 'Second task',
      acceptanceCriteria: ['Criterion 2'],
      dependsOn: ['task-1'],
      status: 'pending',
    };

    sampleTask3 = {
      id: 'task-3',
      title: 'Task 3',
      description: 'Third task',
      acceptanceCriteria: ['Criterion 3'],
      dependsOn: [],
      status: 'done',
      agentResult: 'Completed successfully',
    };

    samplePlan = {
      id: 'plan-1',
      name: 'Test Plan',
      description: 'A test plan',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      tasks: [sampleTask1, sampleTask2, sampleTask3],
    };
  });

  describe('markTasksAsInterrupted', () => {
    it('should mark specified tasks as interrupted', () => {
      const orphanedSessions: OrphanedSessionInfo[] = [
        {
          taskId: 'task-1',
          sessionId: 'session-123',
          task: sampleTask1,
          sessionModifiedTime: new Date(),
        },
      ];

      const result = markTasksAsInterrupted(samplePlan, orphanedSessions);

      expect(result.tasks[0].status).toBe('interrupted');
      expect(result.tasks[1].status).toBe('pending');
      expect(result.tasks[2].status).toBe('done');
    });

    it('should not modify tasks that are not orphaned', () => {
      const orphanedSessions: OrphanedSessionInfo[] = [];

      const result = markTasksAsInterrupted(samplePlan, orphanedSessions);

      expect(result.tasks[0].status).toBe('in_progress');
      expect(result.tasks[1].status).toBe('pending');
      expect(result.tasks[2].status).toBe('done');
    });

    it('should handle multiple orphaned sessions', () => {
      const task4: Task = {
        id: 'task-4',
        title: 'Task 4',
        description: 'Fourth task',
        acceptanceCriteria: [],
        dependsOn: [],
        status: 'in_progress',
        sessionId: 'session-456',
      };

      samplePlan.tasks.push(task4);

      const orphanedSessions: OrphanedSessionInfo[] = [
        {
          taskId: 'task-1',
          sessionId: 'session-123',
          task: sampleTask1,
          sessionModifiedTime: new Date(),
        },
        {
          taskId: 'task-4',
          sessionId: 'session-456',
          task: task4,
          sessionModifiedTime: new Date(),
        },
      ];

      const result = markTasksAsInterrupted(samplePlan, orphanedSessions);

      expect(result.tasks[0].status).toBe('interrupted');
      expect(result.tasks[1].status).toBe('pending');
      expect(result.tasks[2].status).toBe('done');
      expect(result.tasks[3].status).toBe('interrupted');
    });

    it('should return a new plan object without mutating the original', () => {
      const orphanedSessions: OrphanedSessionInfo[] = [
        {
          taskId: 'task-1',
          sessionId: 'session-123',
          task: sampleTask1,
          sessionModifiedTime: new Date(),
        },
      ];

      const result = markTasksAsInterrupted(samplePlan, orphanedSessions);

      expect(result).not.toBe(samplePlan);
      expect(result.tasks).not.toBe(samplePlan.tasks);
      expect(samplePlan.tasks[0].status).toBe('in_progress'); // Original unchanged
      expect(result.tasks[0].status).toBe('interrupted'); // Result changed
    });
  });
});
