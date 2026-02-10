import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Plan } from '../models/plan.js';
import { executePlan } from '../services/executor.js';
import { savePlan } from '../services/persistence.js';
import { computeBatches } from '../utils/dependency-graph.js';
import TaskTree from '../components/task-tree.js';
import StatusBar from '../components/status-bar.js';

interface ExecuteScreenProps {
  plan: Plan;
  onDone: (plan: Plan) => void;
  onBack: () => void;
}

export default function ExecuteScreen({
  plan,
  onDone,
  onBack,
}: ExecuteScreenProps): React.ReactElement {
  const [currentPlan, setCurrentPlan] = useState(plan);
  const [executing, setExecuting] = useState(false);
  const [started, setStarted] = useState(false);
  const [batchIndex, setBatchIndex] = useState(-1);
  const [log, setLog] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const addLog = (msg: string) => setLog((prev) => [...prev, msg]);

  useInput((ch, key) => {
    if (key.escape && !executing) onBack();
    if (ch === 'x' && !started) {
      setStarted(true);
      setExecuting(true);
    }
    if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow) {
      setSelectedIndex((i) => Math.min(currentPlan.tasks.length - 1, i + 1));
    }
  });

  useEffect(() => {
    if (!started || !executing) return;

    executePlan(currentPlan, {
      onTaskStart: (taskId) => {
        addLog(`▶ Starting: ${taskId}`);
        setCurrentPlan((p) => ({
          ...p,
          tasks: p.tasks.map((t) =>
            t.id === taskId ? { ...t, status: 'in_progress' as const } : t,
          ),
        }));
      },
      onTaskDone: (taskId, result) => {
        addLog(`✓ Done: ${taskId}`);
        setCurrentPlan((p) => ({
          ...p,
          tasks: p.tasks.map((t) =>
            t.id === taskId ? { ...t, status: 'done' as const, agentResult: result } : t,
          ),
        }));
      },
      onTaskFailed: (taskId, error) => {
        addLog(`✗ Failed: ${taskId} — ${error}`);
        setCurrentPlan((p) => ({
          ...p,
          tasks: p.tasks.map((t) =>
            t.id === taskId ? { ...t, status: 'failed' as const, agentResult: error } : t,
          ),
        }));
      },
      onBatchComplete: (idx) => {
        setBatchIndex(idx);
        addLog(`── Batch ${idx + 1} complete ──`);
      },
      onAllDone: (finalPlan) => {
        setCurrentPlan(finalPlan);
        setExecuting(false);
        savePlan(finalPlan);
        addLog('✦ All tasks complete');
        onDone(finalPlan);
      },
    });
  }, [started]);

  const { batches } = computeBatches(plan.tasks);
  const doneCount = currentPlan.tasks.filter((t) => t.status === 'done').length;
  const failedCount = currentPlan.tasks.filter((t) => t.status === 'failed').length;

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">Execute Plan</Text>
        <Text color="gray">
          {' '}— {doneCount}/{currentPlan.tasks.length} done
          {failedCount > 0 && <Text color="red"> ({failedCount} failed)</Text>}
        </Text>
      </Box>

      {!started && (
        <Box marginBottom={1}>
          <Text color="yellow">
            Press x to start executing {currentPlan.tasks.length} tasks in {batches.length} parallel batches
          </Text>
        </Box>
      )}

      <TaskTree tasks={currentPlan.tasks} selectedIndex={selectedIndex} />

      {log.length > 0 && (
        <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
          <Text bold color="gray">Execution Log:</Text>
          {log.slice(-10).map((entry, i) => (
            <Text key={i} color="gray">{entry}</Text>
          ))}
        </Box>
      )}

      <StatusBar
        screen="Execute"
        hint={executing ? '⏳ executing...' : started ? '✓ done  esc: back' : 'x: start  esc: back'}
      />
    </Box>
  );
}
