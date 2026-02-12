import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import type { Plan } from '../models/plan.js';
import { validatePlan } from '../services/validator.js';
import type { ValidationReport, TaskValidationResult, CriterionVerdict } from '../services/validator.js';
import Spinner from '../components/spinner.js';
import StatusBar from '../components/status-bar.js';

interface ValidateScreenProps {
  plan: Plan;
  onBack: () => void;
}

const VERDICT_ICON: Record<CriterionVerdict, string> = {
  pass: '✅',
  fail: '❌',
  partial: '⚠️',
  unknown: '❓',
};

const VERDICT_COLOR: Record<CriterionVerdict, string> = {
  pass: 'green',
  fail: 'red',
  partial: 'yellow',
  unknown: 'gray',
};

export default function ValidateScreen({
  plan,
  onBack,
}: ValidateScreenProps): React.ReactElement {
  const [validating, setValidating] = useState(false);
  const [started, setStarted] = useState(false);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const completedTasksRef = useRef<TaskValidationResult[]>([]);
  const [selectedTaskIndex, setSelectedTaskIndex] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fast-changing data lives in refs to avoid per-event re-renders
  const activeTasksRef = useRef<Set<string>>(new Set());
  const streamBufferRef = useRef<Record<string, string>>({});

  // A single tick counter drives periodic UI refreshes while validating
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [, setTick] = useState(0);
  const TICK_MS = 400;

  // Start / stop the render tick
  const startTick = useCallback(() => {
    if (tickRef.current) return;
    tickRef.current = setInterval(() => setTick((t) => t + 1), TICK_MS);
  }, []);
  const stopTick = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  // Snapshot refs for render (read once per render cycle)
  const activeTaskIds = [...activeTasksRef.current];
  const activeCount = activeTaskIds.length;
  const taskStreams = streamBufferRef.current;
  const completedTasks = completedTasksRef.current;

  const totalTasks = plan.tasks.length;
  const doneValidating = completedTasks.length;

  useInput((ch, key) => {
    if (key.escape && !validating) onBack();

    if (ch === 'v' && !started) {
      setStarted(true);
      setValidating(true);
    }

    if (key.upArrow) {
      setSelectedTaskIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow) {
      const maxIdx = report ? report.taskResults.length - 1 : completedTasks.length - 1;
      setSelectedTaskIndex((i) => Math.min(maxIdx, i + 1));
    }
  });

  useEffect(() => {
    if (!started || !validating) return;

    startTick();

    validatePlan(plan, {
      onTaskStart: (taskId) => {
        activeTasksRef.current.add(taskId);
        streamBufferRef.current[taskId] = '';
      },
      onTaskDelta: (taskId, _delta, fullText) => {
        streamBufferRef.current[taskId] = fullText;
      },
      onTaskDone: (_taskId, result) => {
        activeTasksRef.current.delete(result.taskId);
        delete streamBufferRef.current[result.taskId];
        completedTasksRef.current.push(result);
      },
      onTaskError: (taskId, error) => {
        activeTasksRef.current.delete(taskId);
        delete streamBufferRef.current[taskId];
        setErrorMsg(`Task ${taskId}: ${error}`);
      },
      onAllDone: (finalReport) => {
        stopTick();
        setReport(finalReport);
        setValidating(false);
      },
    });

    return () => {
      stopTick();
    };
  }, [started]);

  // Determine which results to display
  const displayResults = report ? report.taskResults : completedTasks;
  const selectedResult = displayResults[selectedTaskIndex];

  // Progress bar
  const progressPct = totalTasks > 0 ? Math.round((doneValidating / totalTasks) * 100) : 0;
  const barWidth = 30;
  const filled = Math.round((doneValidating / totalTasks) * barWidth) || 0;
  const progressBar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);

  // Terminal height for fixed layout
  const { stdout } = useStdout();
  const termRows = stdout?.rows ?? 24;
  // Reserve rows: 1 padding top + 2 header + 1 not-started/progress + 3 report summary + 3 status bar + 1 padding bottom = ~11
  const contentRows = Math.max(6, termRows - 11);

  // Window the task list around the selected index
  const maxTaskListRows = Math.min(displayResults.length, Math.floor(contentRows / 2));
  let taskListStart = 0;
  if (displayResults.length > maxTaskListRows) {
    taskListStart = Math.max(0, Math.min(selectedTaskIndex - Math.floor(maxTaskListRows / 2), displayResults.length - maxTaskListRows));
  }
  const visibleResults = displayResults.slice(taskListStart, taskListStart + maxTaskListRows);

  // Detail panel gets remaining rows
  const detailRows = Math.max(3, contentRows - maxTaskListRows - 1);

  return (
    <Box flexDirection="column" height={termRows}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">Validate Plan</Text>
        <Text color="gray"> — </Text>
        <Text color="green">{doneValidating}</Text>
        <Text color="gray">/{totalTasks} validated</Text>
      </Box>

      {/* Not started */}
      {!started && (
        <Box>
          <Text color="yellow">
            Press v to validate {totalTasks} tasks against their acceptance criteria
          </Text>
        </Box>
      )}

      {/* Progress bar */}
      {started && (
        <Box>
          <Text color="green">{progressBar}</Text>
          <Text color="gray"> {progressPct}%</Text>
          {validating && activeCount > 0 && (
            <>
              <Text color="gray"> — validating </Text>
              <Text color="yellow">{activeCount} task{activeCount > 1 ? 's' : ''}</Text>
              <Text color="yellow"> </Text>
              <Spinner />
            </>
          )}
        </Box>
      )}

      {/* Overall summary when done */}
      {report && (
        <Box flexDirection="column">
          <Box>
            <Text bold color="white">Validation Report</Text>
            <Text color="gray"> — {report.planName}</Text>
          </Box>
          <Box>
            <Text color="green">✅ {report.overallPass} pass</Text>
            <Text color="gray"> │ </Text>
            <Text color="red">❌ {report.overallFail} fail</Text>
            <Text color="gray"> │ </Text>
            <Text color="yellow">⚠️  {report.overallPartial} partial</Text>
            <Text color="gray"> │ </Text>
            <Text color="gray">❓ {report.overallUnknown} unknown</Text>
            <Text color="gray"> │ </Text>
            <Text color="white" bold>{report.totalCriteria} total criteria</Text>
          </Box>
        </Box>
      )}

      {/* Task list — windowed */}
      {visibleResults.length > 0 && (
        <Box flexDirection="column" height={maxTaskListRows + 1} overflow="hidden">
          {taskListStart > 0 && (
            <Text color="gray" dimColor>  ↑ {taskListStart} more above</Text>
          )}
          {visibleResults.map((tr) => {
            const realIndex = displayResults.indexOf(tr);
            const isSelected = realIndex === selectedTaskIndex;
            const passCount = tr.criteriaResults.filter((c) => c.verdict === 'pass').length;
            const totalCount = tr.criteriaResults.length;
            const allPass = passCount === totalCount && totalCount > 0;
            const hasFail = tr.criteriaResults.some((c) => c.verdict === 'fail');
            const taskColor = allPass ? 'green' : hasFail ? 'red' : 'yellow';
            const taskIcon = allPass ? '✅' : hasFail ? '❌' : '⚠️';

            return (
              <Box key={tr.taskId}>
                <Text color={isSelected ? 'white' : 'gray'}>{isSelected ? '❯ ' : '  '}</Text>
                <Text>{taskIcon} </Text>
                <Text color={isSelected ? 'white' : taskColor} bold={isSelected}>
                  {tr.taskId}
                </Text>
                <Text color="gray"> — {tr.taskTitle} </Text>
                <Text color={taskColor}>({passCount}/{totalCount} pass)</Text>
              </Box>
            );
          })}
          {taskListStart + maxTaskListRows < displayResults.length && (
            <Text color="gray" dimColor>  ↓ {displayResults.length - taskListStart - maxTaskListRows} more below</Text>
          )}
        </Box>
      )}

      {/* Detail view for selected task — constrained height */}
      {selectedResult && (
        <Box
          flexDirection="column"
          marginLeft={1}
          height={detailRows}
          overflow="hidden"
        >
          <Box>
            <Text color="cyan">▌ </Text>
            <Text color="cyan" bold>{selectedResult.taskId}</Text>
            <Text color="gray"> — {selectedResult.taskTitle}</Text>
            <Text color="gray"> [{selectedResult.status}]</Text>
          </Box>

          {selectedResult.criteriaResults.slice(0, detailRows - 2).map((cr, i) => (
            <Box key={i}>
              <Text color="cyan">▌ </Text>
              <Text>{VERDICT_ICON[cr.verdict]} </Text>
              <Text color={VERDICT_COLOR[cr.verdict]} bold>
                [{cr.verdict.toUpperCase()}]
              </Text>
              <Text color="gray"> {cr.criterion}</Text>
            </Box>
          ))}

          {selectedResult.summary && selectedResult.criteriaResults.length < detailRows - 3 && (
            <Box>
              <Text color="cyan">▌ </Text>
              <Text color="gray" italic>Summary: {selectedResult.summary}</Text>
            </Box>
          )}
        </Box>
      )}

      {/* Active validations — fixed height panel */}
      {validating && !selectedResult && (
        <Box
          flexDirection="column"
          marginLeft={1}
          height={8}
          overflow="hidden"
        >
          {activeCount > 0 ? (
            <>
              {activeTaskIds.slice(0, 4).map((taskId) => {
                const stream = taskStreams[taskId];
                const lastLine = stream ? stream.split('\n').filter(Boolean).pop() ?? '' : '';
                return (
                  <Box key={taskId} flexDirection="column">
                    <Box>
                      <Text color="yellow">▌ </Text>
                      <Text color="yellow" bold>{taskId}</Text>
                      <Text color="gray"> </Text>
                      <Spinner />
                    </Box>
                    {lastLine ? (
                      <Box>
                        <Text color="yellow">▌ </Text>
                        <Text color="gray" wrap="truncate">{lastLine.slice(0, 80)}</Text>
                      </Box>
                    ) : (
                      <Box><Text> </Text></Box>
                    )}
                  </Box>
                );
              })}
              {activeCount > 4 && (
                <Text color="gray" dimColor>  ... and {activeCount - 4} more</Text>
              )}
            </>
          ) : (
            <Box><Text color="gray">Waiting for tasks...</Text></Box>
          )}
        </Box>
      )}

      {/* Error */}
      {errorMsg && (
        <Box>
          <Text color="red">⚠ {errorMsg}</Text>
        </Box>
      )}

      {/* Spacer to push status bar to bottom */}
      <Box flexGrow={1} />

      <StatusBar
        screen="Validate"
        hint={
          validating
            ? '↑↓: select task  ⏳ validating...'
            : started
              ? '↑↓: select task  esc: back'
              : 'v: start validation  esc: back'
        }
      />
    </Box>
  );
}
