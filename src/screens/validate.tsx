import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
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
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [completedTasks, setCompletedTasks] = useState<TaskValidationResult[]>([]);
  const [selectedTaskIndex, setSelectedTaskIndex] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [streamText, setStreamText] = useState<Record<string, string>>({});

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

    validatePlan(plan, {
      onTaskStart: (taskId) => {
        setCurrentTaskId(taskId);
      },
      onTaskDelta: (taskId, _delta, fullText) => {
        setStreamText((prev) => ({ ...prev, [taskId]: fullText }));
      },
      onTaskDone: (_taskId, result) => {
        setCompletedTasks((prev) => [...prev, result]);
        setCurrentTaskId(null);
      },
      onTaskError: (taskId, error) => {
        setErrorMsg(`Task ${taskId}: ${error}`);
        setCurrentTaskId(null);
      },
      onAllDone: (finalReport) => {
        setReport(finalReport);
        setValidating(false);
      },
    });
  }, [started]);

  // Determine which results to display
  const displayResults = report ? report.taskResults : completedTasks;
  const selectedResult = displayResults[selectedTaskIndex];

  // Progress bar
  const progressPct = totalTasks > 0 ? Math.round((doneValidating / totalTasks) * 100) : 0;
  const barWidth = 30;
  const filled = Math.round((doneValidating / totalTasks) * barWidth) || 0;
  const progressBar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">Validate Plan</Text>
        <Text color="gray"> — </Text>
        <Text color="green">{doneValidating}</Text>
        <Text color="gray">/{totalTasks} validated</Text>
      </Box>

      {/* Not started */}
      {!started && (
        <Box marginBottom={1}>
          <Text color="yellow">
            Press v to validate {totalTasks} tasks against their acceptance criteria
          </Text>
        </Box>
      )}

      {/* Progress bar */}
      {started && (
        <Box marginBottom={1}>
          <Text color="green">{progressBar}</Text>
          <Text color="gray"> {progressPct}%</Text>
          {validating && currentTaskId && (
            <>
              <Text color="gray"> — validating </Text>
              <Text color="yellow">{currentTaskId}</Text>
              <Text color="yellow"> </Text>
              <Spinner />
            </>
          )}
        </Box>
      )}

      {/* Overall summary when done */}
      {report && (
        <Box marginBottom={1} flexDirection="column">
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

      {/* Task list */}
      {displayResults.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          {displayResults.map((tr, i) => {
            const isSelected = i === selectedTaskIndex;
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
        </Box>
      )}

      {/* Detail view for selected task */}
      {selectedResult && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="cyan"
          paddingX={1}
        >
          <Box marginBottom={1}>
            <Text color="cyan" bold>{selectedResult.taskId}</Text>
            <Text color="gray"> — {selectedResult.taskTitle}</Text>
            <Text color="gray"> [{selectedResult.status}]</Text>
          </Box>

          <Text color="white" bold dimColor>  EXPECTED vs ACTUAL</Text>

          {selectedResult.criteriaResults.map((cr, i) => (
            <Box key={i} flexDirection="column" marginTop={i > 0 ? 1 : 0}>
              <Box>
                <Text>{VERDICT_ICON[cr.verdict]} </Text>
                <Text color={VERDICT_COLOR[cr.verdict]} bold>
                  [{cr.verdict.toUpperCase()}]
                </Text>
              </Box>
              <Box marginLeft={3}>
                <Text color="white" bold>EXPECTED: </Text>
                <Text color="gray" wrap="wrap">{cr.criterion}</Text>
              </Box>
              <Box marginLeft={3}>
                <Text color="white" bold>ACTUAL:   </Text>
                <Text color={VERDICT_COLOR[cr.verdict]} wrap="wrap">{cr.actual}</Text>
              </Box>
            </Box>
          ))}

          {selectedResult.summary && (
            <Box marginTop={1}>
              <Text color="gray" italic>Summary: {selectedResult.summary}</Text>
            </Box>
          )}
        </Box>
      )}

      {/* Currently streaming validation */}
      {validating && currentTaskId && streamText[currentTaskId] && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="yellow"
          paddingX={1}
          height={6}
          marginTop={1}
        >
          <Text color="yellow" bold>Validating: {currentTaskId}</Text>
          {(() => {
            const lines = streamText[currentTaskId]!.split('\n');
            const maxLines = 4;
            const visible = lines.slice(-maxLines);
            return visible.map((line, i) => (
              <Text key={i} color="gray" wrap="truncate">{line}</Text>
            ));
          })()}
        </Box>
      )}

      {/* Error */}
      {errorMsg && (
        <Box marginTop={1}>
          <Text color="red">⚠ {errorMsg}</Text>
        </Box>
      )}

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
