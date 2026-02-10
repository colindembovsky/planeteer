import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Plan, Task, ChatMessage } from '../models/plan.js';
import { createPlan } from '../models/plan.js';
import { generateWBS } from '../services/planner.js';
import { detectCycles, computeBatches } from '../utils/dependency-graph.js';
import TaskTree from '../components/task-tree.js';
import BatchView from '../components/batch-view.js';
import Spinner from '../components/spinner.js';
import StatusBar from '../components/status-bar.js';
import { nanoid } from 'nanoid';

type ViewMode = 'tree' | 'batch';

interface BreakdownScreenProps {
  scopeDescription: string;
  messages: ChatMessage[];
  existingPlan?: Plan;
  onPlanReady: (plan: Plan) => void;
  onBack: () => void;
}

export default function BreakdownScreen({
  scopeDescription,
  messages,
  existingPlan,
  onPlanReady,
  onBack,
}: BreakdownScreenProps): React.ReactElement {
  const [plan, setPlan] = useState<Plan | null>(existingPlan || null);
  const [loading, setLoading] = useState(!existingPlan);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('tree');

  useEffect(() => {
    if (existingPlan) return;

    setLoading(true);
    generateWBS(scopeDescription)
      .then((tasks) => {
        const newPlan = createPlan({
          id: nanoid(8),
          name: scopeDescription.slice(0, 60),
          description: scopeDescription,
          tasks,
        });
        setPlan(newPlan);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [scopeDescription, existingPlan]);

  useInput((ch, key) => {
    if (key.escape) onBack();
    if (!plan) return;

    if (key.tab) {
      setViewMode((v) => (v === 'tree' ? 'batch' : 'tree'));
      setSelectedIndex(0);
    } else if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow) {
      setSelectedIndex((i) => Math.min(plan.tasks.length - 1, i + 1));
    } else if (key.return) {
      onPlanReady(plan);
    }
  });

  if (loading) {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold color="cyan">Work Breakdown</Text>
        </Box>
        <Box marginBottom={1}>
          <Spinner label="Generating work breakdown" />
        </Box>
        <StatusBar screen="Breakdown" hint="hang tight..." />
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">Error: {error}</Text>
        <StatusBar screen="Breakdown" hint="esc: back" />
      </Box>
    );
  }

  if (!plan) return <Text>No plan</Text>;

  const cycles = detectCycles(plan.tasks);
  const { batches } = computeBatches(plan.tasks);

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">Work Breakdown</Text>
        <Text color="gray"> — {plan.tasks.length} tasks, {batches.length} parallel batches</Text>
        <Text color="gray"> │ </Text>
        <Text color={viewMode === 'tree' ? 'green' : 'gray'} bold={viewMode === 'tree'}>
          🌳 Tree
        </Text>
        <Text color="gray"> / </Text>
        <Text color={viewMode === 'batch' ? 'green' : 'gray'} bold={viewMode === 'batch'}>
          📦 Batches
        </Text>
      </Box>

      {cycles.length > 0 && (
        <Box marginBottom={1}>
          <Text color="red" bold>⚠ Dependency cycle detected: {cycles.join(' → ')}</Text>
        </Box>
      )}

      {viewMode === 'tree' ? (
        <TaskTree tasks={plan.tasks} selectedIndex={selectedIndex} />
      ) : (
        <BatchView tasks={plan.tasks} batches={batches} selectedIndex={selectedIndex} />
      )}

      <StatusBar screen="Breakdown" hint="↑↓: navigate  ⇥: toggle view  ⏎: proceed to refine  esc: back" />
    </Box>
  );
}
