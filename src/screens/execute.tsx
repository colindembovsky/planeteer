import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Plan, Task } from '../models/plan.js';
import { executePlan } from '../services/executor.js';
import type { ExecutionOptions, ExecutionHandle } from '../services/executor.js';
import type { SessionEventData } from '../services/copilot.js';
import { savePlan, summarizePlan } from '../services/persistence.js';
import { computeBatches } from '../utils/dependency-graph.js';
import Spinner from '../components/spinner.js';
import StatusBar from '../components/status-bar.js';

interface ExecuteScreenProps {
  plan: Plan;
  codebaseContext?: string;
  onDone: (plan: Plan) => void;
  onBack: () => void;
}

interface DisplayEvent {
  taskId: string;
  type: string;
  timestamp: string;
  message: string;
  isError: boolean;
}

const STATUS_ICON: Record<string, string> = {
  pending: '○',
  in_progress: '◉',
  done: '✓',
  failed: '✗',
};

const STATUS_COLOR: Record<string, string> = {
  pending: 'gray',
  in_progress: 'yellow',
  done: 'green',
  failed: 'red',
};

// Helper to format session events for display
function formatSessionEvent(taskId: string, event: SessionEventData): DisplayEvent {
  const time = new Date(event.timestamp).toLocaleTimeString();
  let message = '';
  let isError = false;

  switch (event.type) {
    case 'tool.execution_start':
      message = `Tool started: ${(event.data as { toolName?: string }).toolName || 'unknown'}`;
      break;
    case 'tool.execution_progress':
      message = `Progress: ${(event.data as { progressMessage?: string }).progressMessage || '...'}`;
      break;
    case 'tool.execution_complete':
      const complete = event.data as { success?: boolean; toolName?: string; error?: { message?: string } };
      if (complete.success === false) {
        message = `Tool failed: ${complete.error?.message || 'unknown error'}`;
        isError = true;
      } else {
        message = `Tool completed successfully`;
      }
      break;
    case 'session.error':
      message = `Error: ${(event.data as { message?: string }).message || 'unknown error'}`;
      isError = true;
      break;
    case 'assistant.usage':
      const usage = event.data as { inputTokens?: number; outputTokens?: number; model?: string };
      message = `Token usage — Model: ${usage.model || 'unknown'}, In: ${usage.inputTokens || 0}, Out: ${usage.outputTokens || 0}`;
      break;
    default:
      // Show other events with minimal formatting
      message = event.type;
  }

  return {
    taskId,
    type: event.type,
    timestamp: time,
    message,
    isError,
  };
}

export default function ExecuteScreen({
  plan,
  codebaseContext,
  onDone,
  onBack,
}: ExecuteScreenProps): React.ReactElement {
  const [currentPlan, setCurrentPlan] = useState(plan);
  const [executing, setExecuting] = useState(false);
  const [started, setStarted] = useState(false);
  const [activeBatchIndex, setActiveBatchIndex] = useState(0);
  const [viewBatchIndex, setViewBatchIndex] = useState(0);
  const [taskStreams, setTaskStreams] = useState<Record<string, string>>({});
  const [selectedTaskIndex, setSelectedTaskIndex] = useState(0);
  const [initStatus, setInitStatus] = useState<'pending' | 'in_progress' | 'done' | 'failed'>('pending');
  const [runCount, setRunCount] = useState(0); // incremented to re-trigger execution
  const execHandleRef = useRef<ExecutionHandle | null>(null);
  const [summarized, setSummarized] = useState('');
  const [eventLog, setEventLog] = useState<DisplayEvent[]>([]);
  const [showEventLog, setShowEventLog] = useState(false);

  const { batches } = computeBatches(plan.tasks);
  // Total display batches: init batch (index 0) + real batches
  const totalDisplayBatches = batches.length + 1;

  useInput((ch, key) => {
    if (key.escape && !executing) onBack();
    if (ch === 'x' && !started) {
      setStarted(true);
      setExecuting(true);
      setRunCount((c) => c + 1);
    }
    // Retry: if a specific failed task is selected, retry just that task (even mid-execution)
    if (ch === 'r' && started) {
      const viewTasks = viewBatchIndex === 0
        ? []
        : (batches[viewBatchIndex - 1] ?? [])
            .map((id) => currentPlan.tasks.find((t) => t.id === id))
            .filter((t): t is Task => t !== undefined);
      const selected = viewTasks[selectedTaskIndex];
      if (selected && selected.status === 'failed' && execHandleRef.current) {
        // Reset task state in UI
        setCurrentPlan((p) => ({
          ...p,
          tasks: p.tasks.map((t) =>
            t.id === selected.id ? { ...t, status: 'pending' as const, agentResult: undefined } : t,
          ),
        }));
        setTaskStreams((prev) => {
          const next = { ...prev };
          delete next[selected.id];
          return next;
        });
        setExecuting(true);
        execHandleRef.current.retryTask(selected.id);
      } else if (!executing) {
        // Retry all failed tasks when execution has stopped
        const hasFailed = currentPlan.tasks.some((t) => t.status === 'failed');
        if (hasFailed) {
          setCurrentPlan((p) => ({
            ...p,
            tasks: p.tasks.map((t) =>
              t.status === 'failed' ? { ...t, status: 'pending' as const, agentResult: undefined } : t,
            ),
          }));
          setTaskStreams((prev) => {
            const next = { ...prev };
            for (const t of currentPlan.tasks) {
              if (t.status === 'failed') delete next[t.id];
            }
            return next;
          });
          setExecuting(true);
          setRunCount((c) => c + 1);
        }
      }
    }
    // Summarize: write summary markdown to project root
    if (ch === 'z' && started && !executing) {
      summarizePlan(currentPlan).then((path) => {
        setSummarized(path);
        setTimeout(() => setSummarized(''), 3000);
      });
    }
    // Toggle event log
    if (ch === 'e' && started) {
      setShowEventLog((prev) => !prev);
    }
    if (key.leftArrow) {
      setViewBatchIndex((i) => Math.max(0, i - 1));
      setSelectedTaskIndex(0);
    } else if (key.rightArrow) {
      setViewBatchIndex((i) => Math.min(totalDisplayBatches - 1, i + 1));
      setSelectedTaskIndex(0);
    } else if (key.upArrow) {
      setSelectedTaskIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow) {
      if (viewBatchIndex === 0) {
        // Init batch has only 1 task
        setSelectedTaskIndex(0);
      } else {
        const batchTasks = batches[viewBatchIndex - 1] ?? [];
        setSelectedTaskIndex((i) => Math.min(batchTasks.length - 1, i + 1));
      }
    }
  });

  useEffect(() => {
    if (!started || !executing || runCount === 0) return;

    const isRetry = runCount > 1;
    const execOptions: ExecutionOptions = { skipInit: isRetry, codebaseContext };

    const handle = executePlan(currentPlan, {
      onTaskStart: (taskId) => {
        if (taskId === 'project-init') {
          setInitStatus('in_progress');
          return;
        }
        setCurrentPlan((p) => ({
          ...p,
          tasks: p.tasks.map((t) =>
            t.id === taskId ? { ...t, status: 'in_progress' as const } : t,
          ),
        }));
      },
      onTaskDelta: (taskId, _delta, fullText) => {
        setTaskStreams((prev) => ({ ...prev, [taskId]: fullText }));
      },
      onTaskDone: (taskId, result) => {
        setTaskStreams((prev) => ({ ...prev, [taskId]: result }));
        if (taskId === 'project-init') {
          setInitStatus('done');
          return;
        }
        setCurrentPlan((p) => ({
          ...p,
          tasks: p.tasks.map((t) =>
            t.id === taskId ? { ...t, status: 'done' as const, agentResult: result } : t,
          ),
        }));
      },
      onTaskFailed: (taskId, error) => {
        setTaskStreams((prev) => ({ ...prev, [taskId]: `Error: ${error}` }));
        if (taskId === 'project-init') {
          setInitStatus('failed');
          return;
        }
        setCurrentPlan((p) => ({
          ...p,
          tasks: p.tasks.map((t) =>
            t.id === taskId ? { ...t, status: 'failed' as const, agentResult: error } : t,
          ),
        }));
      },
      onBatchComplete: (idx) => {
        setActiveBatchIndex(idx + 1);
        // Auto-advance view to the next real batch (offset by 1 for init)
        setViewBatchIndex(Math.min(idx + 2, totalDisplayBatches - 1));
        setSelectedTaskIndex(0);
      },
      onAllDone: (finalPlan) => {
        setCurrentPlan(finalPlan);
        setExecuting(false);
        execHandleRef.current = null;
        savePlan(finalPlan);
        // Only advance to done screen if all tasks succeeded
        const allDone = finalPlan.tasks.every((t) => t.status === 'done');
        if (allDone) {
          onDone(finalPlan);
        }
        // Otherwise stay on execute screen — user can press 'r' to retry
      },
      onSessionEvent: (taskId, event) => {
        const displayEvent = formatSessionEvent(taskId, event);
        setEventLog((prev) => [...prev, displayEvent]);
      },
    }, execOptions);

    execHandleRef.current = handle;
  }, [runCount]);

  const doneCount = currentPlan.tasks.filter((t) => t.status === 'done').length;
  const failedCount = currentPlan.tasks.filter((t) => t.status === 'failed').length;
  const totalCount = currentPlan.tasks.length;

  // Build the list of displayable tasks for the current view index
  // viewBatchIndex 0 = init batch (single virtual task)
  // viewBatchIndex 1+ = real batches (offset by 1)
  const isViewingInit = viewBatchIndex === 0;
  const initTask: Task = {
    id: 'project-init',
    title: 'Create README.md & .gitignore',
    description: 'Bootstrap project files before execution',
    acceptanceCriteria: [],
    dependsOn: [],
    status: initStatus === 'in_progress' ? 'in_progress' : initStatus === 'done' ? 'done' : initStatus === 'failed' ? 'failed' : 'pending',
  };

  const viewBatchTasks: Task[] = isViewingInit
    ? [initTask]
    : (batches[viewBatchIndex - 1] ?? [])
        .map((id) => currentPlan.tasks.find((t) => t.id === id))
        .filter((t): t is Task => t !== undefined);

  const selectedTask = viewBatchTasks[selectedTaskIndex];
  const selectedStream = selectedTask ? taskStreams[selectedTask.id] : undefined;

  // Progress bar (counts only real tasks, not init)
  const progressPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const barWidth = 30;
  const filled = Math.round((doneCount / totalCount) * barWidth) || 0;
  const progressBar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">Execute Plan</Text>
        <Text color="gray"> — </Text>
        <Text color="green">{doneCount}</Text>
        <Text color="gray">/{totalCount} done</Text>
        {failedCount > 0 && <Text color="red"> ({failedCount} failed)</Text>}
      </Box>

      {/* Progress bar */}
      {started && (
        <Box marginBottom={1}>
          <Text color="green">{progressBar}</Text>
          <Text color="gray"> {progressPct}%</Text>
        </Box>
      )}

      {!started && (
        <Box marginBottom={1}>
          <Text color="yellow">
            Press x to start — init files (README.md, .gitignore) then {totalCount} tasks in {batches.length} batches
          </Text>
        </Box>
      )}

      {/* Batch tabs */}
      {started && (
        <Box marginBottom={1}>
          {/* Init tab */}
          {(() => {
            const initColor = initStatus === 'failed' ? 'red' : initStatus === 'done' ? 'green' : initStatus === 'in_progress' ? 'yellow' : 'gray';
            const isActive = viewBatchIndex === 0;
            return (
              <Box marginRight={1}>
                <Text
                  color={initColor}
                  bold={isActive}
                  underline={isActive}
                >
                  Init
                </Text>
              </Box>
            );
          })()}
          {/* Real batch tabs */}
          {batches.map((_batchIds, i) => {
            const displayIdx = i + 1;
            const isActive = displayIdx === viewBatchIndex;
            const batchTasks = _batchIds
              .map((id) => currentPlan.tasks.find((t) => t.id === id))
              .filter((t): t is Task => t !== undefined);
            const batchDone = batchTasks.every((t) => t.status === 'done');
            const batchFailed = batchTasks.some((t) => t.status === 'failed');
            const batchRunning = batchTasks.some((t) => t.status === 'in_progress');
            const batchColor = batchFailed
              ? 'red'
              : batchDone
                ? 'green'
                : batchRunning
                  ? 'yellow'
                  : 'gray';
            const parallel = _batchIds.length > 1;
            return (
              <Box key={i} marginRight={1}>
                <Text
                  color={batchColor}
                  bold={isActive}
                  underline={isActive}
                >
                  {parallel ? '⫘ ' : ''}Batch {i + 1}{parallel ? ` (×${_batchIds.length})` : ''}
                </Text>
              </Box>
            );
          })}
        </Box>
      )}

      {/* Batch task list */}
      {started && viewBatchTasks.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          {viewBatchTasks.map((task, i) => {
            const isSelected = i === selectedTaskIndex;
            const icon = STATUS_ICON[task.status] ?? '?';
            const color = STATUS_COLOR[task.status] ?? 'gray';
            return (
              <Box key={task.id}>
                <Text color={isSelected ? 'white' : 'gray'}>{isSelected ? '❯ ' : '  '}</Text>
                <Text color={color}>{icon} </Text>
                <Text color={isSelected ? 'white' : color} bold={isSelected}>
                  {task.id}
                </Text>
                <Text color="gray"> — {task.title}</Text>
                {task.status === 'in_progress' && (
                  <Text color="yellow"> </Text>
                )}
                {task.status === 'in_progress' && <Spinner />}
              </Box>
            );
          })}
        </Box>
      )}

      {/* Streaming output for selected task */}
      {started && selectedTask && selectedStream && (
        <Box
          flexDirection="column"
          marginLeft={1}
          height={10}
        >
          <Box marginBottom={0}>
            <Text color="cyan" bold>{selectedTask.id}</Text>
            <Text color="gray">
              {' '}({selectedStream.length} chars)
            </Text>
          </Box>
          {(() => {
            const lines = selectedStream.split('\n');
            const maxLines = 7;
            const visible = lines.slice(-maxLines);
            const truncated = lines.length > maxLines;
            return (
              <>
                {truncated && (
                  <Text color="gray" dimColor>  ··· {lines.length - maxLines} lines above ···</Text>
                )}
                {visible.map((line, i) => (
                  <Text key={i} color="gray" wrap="truncate">{line}</Text>
                ))}
              </>
            );
          })()}
        </Box>
      )}

      {/* No stream yet for selected task */}
      {started && selectedTask && !selectedStream && selectedTask.status === 'in_progress' && (
        <Box marginLeft={1}>
          <Text color="yellow">▌ </Text>
          <Spinner label={`Waiting for output from ${selectedTask.id}`} showElapsed />
        </Box>
      )}

      {/* Retry prompt when there are failures */}
      {started && !executing && failedCount > 0 && (
        <Box marginBottom={1}>
          <Text color="red" bold>
            {failedCount} task{failedCount > 1 ? 's' : ''} failed.
          </Text>
          <Text color="yellow"> Press r to retry failed tasks.</Text>
        </Box>
      )}

      {/* Summarize hint when execution is done */}
      {started && !executing && summarized === '' && (
        <Box marginBottom={1}>
          <Text color="cyan">Tip: press </Text>
          <Text color="green" bold>z</Text>
          <Text color="cyan"> to summarize this plan and execution to a markdown file</Text>
        </Box>
      )}

      {summarized !== '' && (
        <Box marginBottom={1}>
          <Text color="green">✓ Summary written to {summarized}</Text>
        </Box>
      )}

      {/* Event Log */}
      {showEventLog && eventLog.length > 0 && (
        <Box flexDirection="column" marginBottom={1} borderStyle="single" borderColor="cyan" paddingX={1}>
          <Box marginBottom={0}>
            <Text color="cyan" bold>Session Event Log</Text>
            <Text color="gray"> ({eventLog.length} events)</Text>
          </Box>
          {(() => {
            const maxEvents = 8;
            const visible = eventLog.slice(-maxEvents);
            const truncated = eventLog.length > maxEvents;
            return (
              <>
                {truncated && (
                  <Text color="gray" dimColor>··· {eventLog.length - maxEvents} earlier events ···</Text>
                )}
                {visible.map((evt, i) => (
                  <Box key={i}>
                    <Text color="gray">[{evt.timestamp}] </Text>
                    <Text color="cyan">{evt.taskId}: </Text>
                    <Text color={evt.isError ? 'red' : 'white'}>{evt.message}</Text>
                  </Box>
                ))}
              </>
            );
          })()}
        </Box>
      )}

      {/* Event log hint */}
      {started && !showEventLog && eventLog.length > 0 && (
        <Box marginBottom={1}>
          <Text color="cyan">Press </Text>
          <Text color="green" bold>e</Text>
          <Text color="cyan"> to view session event log ({eventLog.length} events)</Text>
        </Box>
      )}

      <StatusBar
        screen="Execute"
        hint={
          executing && failedCount > 0
            ? '←→: switch batch  ↑↓: select task  r: retry task  e: events  ⏳ executing...'
            : executing
              ? '←→: switch batch  ↑↓: select task  e: events  ⏳ executing...'
              : started && failedCount > 0
                ? '←→: switch batch  ↑↓: select task  r: retry  e: events  z: summarize  esc: back'
                : started
                  ? '←→: switch batch  ↑↓: select task  e: events  z: summarize  esc: back'
                  : 'x: start  esc: back'
        }
      />
    </Box>
  );
}
