import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { Plan } from '../models/plan.js';
import { refineWBS } from '../services/planner.js';
import { savePlan } from '../services/persistence.js';
import { detectCycles, computeBatches } from '../utils/dependency-graph.js';
import TaskTree from '../components/task-tree.js';
import StatusBar from '../components/status-bar.js';

interface RefineScreenProps {
  plan: Plan;
  onPlanUpdated: (plan: Plan) => void;
  onExecute: (plan: Plan) => void;
  onBack: () => void;
}

export default function RefineScreen({
  plan,
  onPlanUpdated,
  onExecute,
  onBack,
}: RefineScreenProps): React.ReactElement {
  const [currentPlan, setCurrentPlan] = useState(plan);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [input, setInput] = useState('');
  const [refining, setRefining] = useState(false);
  const [saved, setSaved] = useState(false);

  useInput((ch, key) => {
    if (key.escape) onBack();
    if (refining) return;

    if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow) {
      setSelectedIndex((i) => Math.min(currentPlan.tasks.length - 1, i + 1));
    } else if (ch === 'x') {
      onExecute(currentPlan);
    } else if (ch === 's') {
      savePlan(currentPlan).then(() => setSaved(true));
      setTimeout(() => setSaved(false), 2000);
    }
  });

  const handleRefine = useCallback(
    (value: string) => {
      if (!value.trim() || refining) return;
      setRefining(true);
      setInput('');

      refineWBS(currentPlan.tasks, value)
        .then((tasks) => {
          const updated = { ...currentPlan, tasks, updatedAt: new Date().toISOString() };
          setCurrentPlan(updated);
          onPlanUpdated(updated);
          setRefining(false);
        })
        .catch(() => setRefining(false));
    },
    [currentPlan, refining, onPlanUpdated],
  );

  const cycles = detectCycles(currentPlan.tasks);
  const { batches } = computeBatches(currentPlan.tasks);

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">Refine Plan</Text>
        <Text color="gray"> — edit tasks or describe changes for Copilot to apply</Text>
      </Box>

      {cycles.length > 0 && (
        <Text color="red" bold>⚠ Cycle detected — fix before executing</Text>
      )}

      <TaskTree tasks={currentPlan.tasks} selectedIndex={selectedIndex} />

      <Box marginTop={1}>
        <Text color="gray">Batches: </Text>
        {batches.map((batch, i) => (
          <Text key={i} color="cyan">
            [{batch.join(', ')}]{i < batches.length - 1 ? ' → ' : ''}
          </Text>
        ))}
      </Box>

      <Box marginTop={1}>
        <Text color="green" bold>{'refine> '}</Text>
        {refining ? (
          <Text color="yellow">⏳ Applying refinement...</Text>
        ) : (
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={handleRefine}
            placeholder="Describe changes (e.g., 'split task X into two', 'add auth task')"
          />
        )}
      </Box>

      {saved && <Text color="green">✓ Plan saved</Text>}

      <StatusBar
        screen="Refine"
        hint="↑↓: navigate  ⏎: refine  s: save  x: execute  esc: back"
      />
    </Box>
  );
}
