import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { Plan, Task, SkillConfig } from '../models/plan.js';
import { refineWBS } from '../services/planner.js';
import { savePlan, summarizePlan } from '../services/persistence.js';
import { getSkillOptions } from '../services/copilot.js';
import { detectCycles, computeBatches } from '../utils/dependency-graph.js';
import TaskTree from '../components/task-tree.js';
import BatchView from '../components/batch-view.js';
import TaskEditor from '../components/task-editor.js';
import Spinner from '../components/spinner.js';
import StreamingText from '../components/streaming-text.js';
import StatusBar from '../components/status-bar.js';

type ViewMode = 'tree' | 'batch' | 'skills';

interface RefineScreenProps {
  plan: Plan;
  onPlanUpdated: (plan: Plan) => void;
  onExecute: (plan: Plan) => void;
  onValidate?: (plan: Plan) => void;
  onBack: () => void;
}

export default function RefineScreen({
  plan,
  onPlanUpdated,
  onExecute,
  onValidate,
  onBack,
}: RefineScreenProps): React.ReactElement {
  const [currentPlan, setCurrentPlan] = useState(plan);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [input, setInput] = useState('');
  const [refining, setRefining] = useState(false);
  const [refineError, setRefineError] = useState<string | null>(null);
  const [lastRefineInput, setLastRefineInput] = useState('');
  const [streamText, setStreamText] = useState('');
  const [saved, setSaved] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('tree');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [commandMode, setCommandMode] = useState(false);

  const toggleSkill = useCallback(
    (skillName: string) => {
      const skills = currentPlan.skills || [];
      const updatedSkills = skills.map((s) =>
        s.name === skillName ? { ...s, enabled: !s.enabled } : s
      );
      const updated = { ...currentPlan, skills: updatedSkills, updatedAt: new Date().toISOString() };
      setCurrentPlan(updated);
      onPlanUpdated(updated);
    },
    [currentPlan, onPlanUpdated]
  );

  const moveTask = useCallback(
    (direction: 'up' | 'down') => {
      const tasks = [...currentPlan.tasks];
      const fromIndex = selectedIndex;
      const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;

      if (toIndex < 0 || toIndex >= tasks.length) return;

      // Swap tasks
      [tasks[fromIndex], tasks[toIndex]] = [tasks[toIndex]!, tasks[fromIndex]!];

      const updated = { ...currentPlan, tasks, updatedAt: new Date().toISOString() };
      setCurrentPlan(updated);
      onPlanUpdated(updated);
      setSelectedIndex(toIndex);
    },
    [currentPlan, selectedIndex, onPlanUpdated],
  );

  useInput((ch, key) => {
    if (key.escape) {
      if (commandMode) {
        setCommandMode(false);
        return;
      }
      onBack();
      return;
    }
    if (refining || editingTask) return;

    // Slash enters command mode
    if (ch === '/' && !commandMode) {
      setCommandMode(true);
      return;
    }

    if (commandMode) {
      setCommandMode(false);
      if (ch === 'e') {
        const task = currentPlan.tasks[selectedIndex];
        if (task) setEditingTask(task);
      } else if (ch === 'x') {
        onExecute(currentPlan);
      } else if (ch === 'v') {
        onValidate?.(currentPlan);
      } else if (ch === 's') {
        savePlan(currentPlan).then(() => setSaved(true));
        setTimeout(() => setSaved(false), 2000);
      } else if (ch === 'z') {
        summarizePlan(currentPlan).then((path) => {
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        });
      } else if (ch === 'r' && refineError) {
        handleRetryRefine();
      }
      return;
    }

    if (key.tab) {
      setViewMode((v) => {
        if (v === 'tree') return 'batch';
        if (v === 'batch') return 'skills';
        return 'tree';
      });
    } else if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow) {
      if (viewMode === 'skills') {
        const skills = currentPlan.skills || [];
        setSelectedIndex((i) => Math.min(skills.length - 1, i + 1));
      } else {
        setSelectedIndex((i) => Math.min(currentPlan.tasks.length - 1, i + 1));
      }
    } else if (ch === '[') {
      moveTask('up');
    } else if (ch === ']') {
      moveTask('down');
    } else if (ch === ' ' && viewMode === 'skills') {
      const skills = currentPlan.skills || [];
      const skill = skills[selectedIndex];
      if (skill) toggleSkill(skill.name);
    }
  });

  const handleEditSave = useCallback(
    (updated: Task) => {
      const tasks = currentPlan.tasks.map((t) => (t.id === updated.id ? updated : t));
      const updatedPlan = { ...currentPlan, tasks, updatedAt: new Date().toISOString() };
      setCurrentPlan(updatedPlan);
      onPlanUpdated(updatedPlan);
      setEditingTask(updated);
    },
    [currentPlan, onPlanUpdated],
  );

  const handleRefine = useCallback(
    (value: string) => {
      if (!value.trim() || refining) return;
      setRefining(true);
      setRefineError(null);
      setLastRefineInput(value);
      setStreamText('');
      setInput('');

      getSkillOptions()
        .then((skillOptions) => 
          refineWBS(currentPlan.tasks, value, (_delta, fullText) => {
            setStreamText(fullText);
          }, skillOptions)
        )
        .then((tasks) => {
          const updated = { ...currentPlan, tasks, updatedAt: new Date().toISOString() };
          setCurrentPlan(updated);
          onPlanUpdated(updated);
          setRefining(false);
        })
        .catch((err) => {
          setRefineError(err.message || 'Refinement failed');
          setRefining(false);
        });
    },
    [currentPlan, refining, onPlanUpdated],
  );

  const handleRetryRefine = useCallback(() => {
    if (lastRefineInput) {
      setRefineError(null);
      handleRefine(lastRefineInput);
    }
  }, [lastRefineInput, handleRefine]);

  const cycles = detectCycles(currentPlan.tasks);
  const { batches } = computeBatches(currentPlan.tasks);

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">Refine Plan</Text>
        <Text color="gray"> — edit tasks or describe changes for Copilot to apply</Text>
        <Text color="gray"> │ </Text>
        <Text color={viewMode === 'tree' ? 'green' : 'gray'} bold={viewMode === 'tree'}>
          🌳 Tree
        </Text>
        <Text color="gray"> / </Text>
        <Text color={viewMode === 'batch' ? 'green' : 'gray'} bold={viewMode === 'batch'}>
          📦 Batches
        </Text>
        <Text color="gray"> / </Text>
        <Text color={viewMode === 'skills' ? 'green' : 'gray'} bold={viewMode === 'skills'}>
          🎯 Skills
        </Text>
      </Box>

      {cycles.length > 0 && (
        <Text color="red" bold>⚠ Cycle detected — fix before executing</Text>
      )}

      {editingTask ? (
        <TaskEditor
          task={editingTask}
          allTaskIds={currentPlan.tasks.map((t) => t.id)}
          onSave={handleEditSave}
          onCancel={() => setEditingTask(null)}
        />
      ) : (
        <>
          {viewMode === 'tree' ? (
            <TaskTree tasks={currentPlan.tasks} selectedIndex={selectedIndex} />
          ) : viewMode === 'batch' ? (
            <BatchView tasks={currentPlan.tasks} batches={batches} selectedIndex={selectedIndex} />
          ) : (
            <Box flexDirection="column" marginBottom={1}>
              <Box marginBottom={1}>
                <Text bold color="cyan">Active Skills</Text>
                {(!currentPlan.skills || currentPlan.skills.length === 0) && (
                  <Text color="gray"> — no skills configured</Text>
                )}
              </Box>
              {currentPlan.skills && currentPlan.skills.length > 0 ? (
                currentPlan.skills.map((skill, idx) => (
                  <Box key={skill.name}>
                    <Text color={idx === selectedIndex ? 'green' : 'gray'}>
                      {idx === selectedIndex ? '❯ ' : '  '}
                    </Text>
                    <Text color={skill.enabled ? 'green' : 'gray'}>
                      {skill.enabled ? '✓' : '○'} {skill.name}
                    </Text>
                  </Box>
                ))
              ) : (
                <Box marginLeft={2}>
                  <Text color="gray">No custom skills found in .planeteer/skills/</Text>
                </Box>
              )}
              <Box marginTop={1}>
                <Text color="gray" italic>
                  Use ↑↓ to select, [space] to toggle, ⇥ to switch view
                </Text>
              </Box>
            </Box>
          )}

          <Box marginTop={1}>
            <Text color="green" bold>{'refine> '}</Text>
            {refining ? (
              <Spinner label="Applying refinement" showElapsed />
            ) : (
              <TextInput
                value={input}
                onChange={(v) => setInput(v.replace(/[\[\]]/g, ''))}
                onSubmit={handleRefine}
                placeholder="Describe changes (e.g., 'split task X into two', 'add auth task')"
              />
            )}
          </Box>

          {refining && streamText && (
            <Box marginTop={1} marginLeft={1}>
              <Text color="gray">▌ </Text>
              <StreamingText text={streamText} maxLines={6} label="Response" />
            </Box>
          )}

          {refineError && (
            <Box marginTop={1} flexDirection="column">
              <Text color="red">⚠ {refineError}</Text>
              <Box>
                <Text color="yellow">Press </Text>
                <Text color="green" bold>/r</Text>
                <Text color="yellow"> to retry the last refinement</Text>
              </Box>
            </Box>
          )}
        </>
      )}

      {commandMode && (
        <Box marginTop={1}>
          <Text color="yellow" bold>/ </Text>
          <Text color="gray">e: edit  s: save  z: summarize  x: execute  v: validate  r: retry  esc: cancel</Text>
        </Box>
      )}

      {saved && <Text color="green">✓ Plan saved</Text>}

      <StatusBar
        screen="Refine"
        hint={viewMode === 'skills' 
          ? "↑↓: navigate  space: toggle skill  ⇥: view  /: commands  esc: back"
          : "↑↓: navigate  []: reorder  ⇥: view  ⏎: refine  /: commands (e/s/z/x/v/r)  esc: back"
        }
      />
    </Box>
  );
}
