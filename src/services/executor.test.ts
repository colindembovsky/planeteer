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
