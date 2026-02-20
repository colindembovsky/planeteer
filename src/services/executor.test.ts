import { describe, it, expect, vi } from 'vitest';
import type { ExecutionCallbacks } from './executor.js';
import type { SessionEventData } from './copilot.js';

describe('ExecutionCallbacks with session events', () => {
  it('should define onSessionEvent callback', () => {
    const mockCallback: ExecutionCallbacks = {
      onTaskStart: vi.fn(),
      onTaskDelta: vi.fn(),
      onTaskDone: vi.fn(),
      onTaskFailed: vi.fn(),
      onBatchComplete: vi.fn(),
      onAllDone: vi.fn(),
      onSessionEvent: vi.fn(),
    };

    expect(mockCallback.onSessionEvent).toBeDefined();
    expect(typeof mockCallback.onSessionEvent).toBe('function');
  });

  it('should call onSessionEvent with taskId and event data', () => {
    const onSessionEvent = vi.fn();
    
    const mockEvent: SessionEventData = {
      type: 'tool.execution_start',
      timestamp: new Date().toISOString(),
      data: { toolName: 'bash' },
    };

    onSessionEvent('task-1', mockEvent);

    expect(onSessionEvent).toHaveBeenCalledWith('task-1', mockEvent);
    expect(onSessionEvent).toHaveBeenCalledTimes(1);
  });

  it('should handle multiple session events for different tasks', () => {
    const onSessionEvent = vi.fn();
    
    const event1: SessionEventData = {
      type: 'tool.execution_start',
      timestamp: new Date().toISOString(),
      data: { toolName: 'bash' },
    };

    const event2: SessionEventData = {
      type: 'tool.execution_complete',
      timestamp: new Date().toISOString(),
      data: { success: true },
    };

    onSessionEvent('task-1', event1);
    onSessionEvent('task-2', event2);

    expect(onSessionEvent).toHaveBeenCalledTimes(2);
    expect(onSessionEvent).toHaveBeenNthCalledWith(1, 'task-1', event1);
    expect(onSessionEvent).toHaveBeenNthCalledWith(2, 'task-2', event2);
  });
});

describe('ExecutionCallbacks event forwarding', () => {
  it('should forward events with taskId context', () => {
    const capturedEvents: Array<{ taskId: string; event: SessionEventData }> = [];
    
    const callbacks: ExecutionCallbacks = {
      onTaskStart: vi.fn(),
      onTaskDelta: vi.fn(),
      onTaskDone: vi.fn(),
      onTaskFailed: vi.fn(),
      onBatchComplete: vi.fn(),
      onAllDone: vi.fn(),
      onSessionEvent: (taskId, event) => {
        capturedEvents.push({ taskId, event });
      },
    };

    // Simulate events from different tasks
    const event1: SessionEventData = {
      type: 'tool.execution_start',
      timestamp: new Date().toISOString(),
      data: { toolName: 'bash' },
    };
    callbacks.onSessionEvent!('task-1', event1);

    const event2: SessionEventData = {
      type: 'tool.execution_progress',
      timestamp: new Date().toISOString(),
      data: { progressMessage: 'Installing dependencies...' },
    };
    callbacks.onSessionEvent!('task-1', event2);

    const event3: SessionEventData = {
      type: 'tool.execution_start',
      timestamp: new Date().toISOString(),
      data: { toolName: 'view' },
    };
    callbacks.onSessionEvent!('task-2', event3);

    // Verify taskId is preserved for each event
    expect(capturedEvents).toHaveLength(3);
    expect(capturedEvents[0].taskId).toBe('task-1');
    expect(capturedEvents[0].event.type).toBe('tool.execution_start');
    expect(capturedEvents[1].taskId).toBe('task-1');
    expect(capturedEvents[1].event.type).toBe('tool.execution_progress');
    expect(capturedEvents[2].taskId).toBe('task-2');
    expect(capturedEvents[2].event.type).toBe('tool.execution_start');
  });

  it('should handle event flow for a complete task lifecycle', () => {
    const eventLog: string[] = [];
    
    const callbacks: ExecutionCallbacks = {
      onTaskStart: (taskId) => eventLog.push(`start:${taskId}`),
      onTaskDelta: vi.fn(),
      onTaskDone: (taskId) => eventLog.push(`done:${taskId}`),
      onTaskFailed: vi.fn(),
      onBatchComplete: vi.fn(),
      onAllDone: vi.fn(),
      onSessionEvent: (taskId, event) => {
        eventLog.push(`event:${taskId}:${event.type}`);
      },
    };

    // Simulate task execution with events
    callbacks.onTaskStart('task-1');
    
    callbacks.onSessionEvent!('task-1', {
      type: 'tool.execution_start',
      timestamp: new Date().toISOString(),
      data: { toolName: 'bash' },
    });

    callbacks.onSessionEvent!('task-1', {
      type: 'tool.execution_complete',
      timestamp: new Date().toISOString(),
      data: { success: true },
    });

    callbacks.onTaskDone('task-1', 'Success');

    // Verify correct event sequence
    expect(eventLog).toEqual([
      'start:task-1',
      'event:task-1:tool.execution_start',
      'event:task-1:tool.execution_complete',
      'done:task-1',
    ]);
  });

  it('should allow ExecutionCallbacks without onSessionEvent', () => {
    const callbacks: ExecutionCallbacks = {
      onTaskStart: vi.fn(),
      onTaskDelta: vi.fn(),
      onTaskDone: vi.fn(),
      onTaskFailed: vi.fn(),
      onBatchComplete: vi.fn(),
      onAllDone: vi.fn(),
      // No onSessionEvent
    };

    expect(callbacks.onSessionEvent).toBeUndefined();
  });

  it('should preserve event data structure when forwarding', () => {
    const onSessionEvent = vi.fn();
    
    const callbacks: ExecutionCallbacks = {
      onTaskStart: vi.fn(),
      onTaskDelta: vi.fn(),
      onTaskDone: vi.fn(),
      onTaskFailed: vi.fn(),
      onBatchComplete: vi.fn(),
      onAllDone: vi.fn(),
      onSessionEvent,
    };

    const complexEvent: SessionEventData = {
      type: 'assistant.usage',
      timestamp: new Date().toISOString(),
      data: {
        model: 'claude-sonnet-4',
        inputTokens: 2000,
        outputTokens: 1000,
        cost: 0.02,
        duration: 5500,
      },
    };

    callbacks.onSessionEvent!('task-1', complexEvent);

    expect(onSessionEvent).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({
        type: 'assistant.usage',
        timestamp: complexEvent.timestamp,
        data: expect.objectContaining({
          model: 'claude-sonnet-4',
          inputTokens: 2000,
          outputTokens: 1000,
        }),
      })
    );
  });

  it('should handle error events with taskId context', () => {
    const errorEvents: Array<{ taskId: string; message: string }> = [];
    
    const callbacks: ExecutionCallbacks = {
      onTaskStart: vi.fn(),
      onTaskDelta: vi.fn(),
      onTaskDone: vi.fn(),
      onTaskFailed: vi.fn(),
      onBatchComplete: vi.fn(),
      onAllDone: vi.fn(),
      onSessionEvent: (taskId, event) => {
        if (event.type === 'session.error') {
          errorEvents.push({
            taskId,
            message: (event.data as { message: string }).message,
          });
        }
      },
    };

    callbacks.onSessionEvent!('task-1', {
      type: 'session.error',
      timestamp: new Date().toISOString(),
      data: {
        errorType: 'timeout',
        message: 'Request timed out after 60s',
      },
    });

    callbacks.onSessionEvent!('task-2', {
      type: 'session.error',
      timestamp: new Date().toISOString(),
      data: {
        errorType: 'auth_failure',
        message: 'Authentication failed',
      },
    });

    expect(errorEvents).toHaveLength(2);
    expect(errorEvents[0]).toEqual({
      taskId: 'task-1',
      message: 'Request timed out after 60s',
    });
    expect(errorEvents[1]).toEqual({
      taskId: 'task-2',
      message: 'Authentication failed',
    });
  });
});
