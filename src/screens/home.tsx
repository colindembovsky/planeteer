import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import type { Plan } from '../models/plan.js';
import { listPlans } from '../services/persistence.js';
import { fetchModels, getModel, setModel, getModelLabel, type ModelEntry } from '../services/copilot.js';
import StatusBar from '../components/status-bar.js';

interface HomeScreenProps {
  onNewPlan: () => void;
  onLoadPlan: (id: string) => void;
  onExecutePlan: (id: string) => void;
  onValidatePlan: (id: string) => void;
}

export default function HomeScreen({ onNewPlan, onLoadPlan, onExecutePlan, onValidatePlan }: HomeScreenProps): React.ReactElement {
  const [savedPlans, setSavedPlans] = useState<{ id: string; name: string; updatedAt: string }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [currentModelLabel, setCurrentModelLabel] = useState(getModelLabel());
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [commandMode, setCommandMode] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  React.useEffect(() => {
    listPlans().then((plans) => {
      setSavedPlans(plans);
      setLoaded(true);
    });
  }, []);

  const items = [
    { label: '✦ Create new plan', value: '__new__' },
    ...savedPlans.map((p) => ({
      label: `  ${p.name} (${p.updatedAt.slice(0, 10)})`,
      value: p.id,
    })),
  ];

  const modelItems = models.map((m) => ({
    label: `${m.id === getModel() ? '● ' : '  '}${m.label}`,
    value: m.id,
  }));

  const handleSelect = (item: { value: string }) => {
    if (item.value === '__new__') {
      onNewPlan();
    } else {
      onLoadPlan(item.value);
    }
  };

  const handleHighlight = (item: { value: string }) => {
    if (item.value !== '__new__') {
      setSelectedPlanId(item.value);
    } else {
      setSelectedPlanId(null);
    }
  };

  const handleModelSelect = (item: { value: string }) => {
    setModel(item.value);
    setCurrentModelLabel(getModelLabel());
    setShowModelPicker(false);
  };

  useInput((ch, key) => {
    if (showModelPicker && key.escape) {
      setShowModelPicker(false);
      return;
    }
    if (commandMode) {
      setCommandMode(false);
      if (selectedPlanId) {
        if (ch === 'x') {
          onExecutePlan(selectedPlanId);
        } else if (ch === 'r') {
          onLoadPlan(selectedPlanId);
        } else if (ch === 'v') {
          onValidatePlan(selectedPlanId);
        }
      }
      return;
    }
    if (!showModelPicker && ch === 'm') {
      setShowModelPicker(true);
      if (models.length === 0 && !modelsLoading) {
        setModelsLoading(true);
        fetchModels()
          .then((m) => setModels(m))
          .catch(() => {})
          .finally(() => setModelsLoading(false));
      }
    }
    if (!showModelPicker && ch === '/' && savedPlans.length > 0) {
      setCommandMode(true);
    }
  });

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="green">🌍 Planeteer</Text>
        <Text color="gray"> — AI-powered work breakdown</Text>
      </Box>

      {showModelPicker ? (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold color="magenta">Select Model</Text>
            <Text color="gray"> — choose the AI model for planning</Text>
          </Box>
          {modelsLoading ? (
            <Text color="gray">Loading models...</Text>
          ) : modelItems.length === 0 ? (
            <Text color="red">No models available. Press esc to go back.</Text>
          ) : (
            <SelectInput items={modelItems} onSelect={handleModelSelect} />
          )}
        </Box>
      ) : !loaded ? (
        <Text color="gray">Loading...</Text>
      ) : (
        <SelectInput items={items} onSelect={handleSelect} onHighlight={handleHighlight} />
      )}

      {commandMode && (
        <Box marginBottom={1}>
          <Text color="magenta" bold>/ </Text>
          <Text color="yellow">r</Text><Text color="gray">: refine  </Text>
          <Text color="yellow">x</Text><Text color="gray">: execute  </Text>
          <Text color="yellow">v</Text><Text color="gray">: validate</Text>
        </Box>
      )}

      <StatusBar
        screen="Home"
        hint={
          commandMode
            ? 'r: refine  x: execute  v: validate'
            : showModelPicker
              ? '↑↓: select  ⏎: choose  esc: back'
              : '↑↓: select  ⏎: choose  m: model  /: commands'
        }
        model={currentModelLabel}
      />
    </Box>
  );
}
