import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import type { Plan } from '../models/plan.js';
import { listPlans } from '../services/persistence.js';
import { AVAILABLE_MODELS, getModel, setModel, getModelLabel, type ModelId } from '../services/copilot.js';
import StatusBar from '../components/status-bar.js';

interface HomeScreenProps {
  onNewPlan: () => void;
  onLoadPlan: (id: string) => void;
}

export default function HomeScreen({ onNewPlan, onLoadPlan }: HomeScreenProps): React.ReactElement {
  const [savedPlans, setSavedPlans] = useState<{ id: string; name: string; updatedAt: string }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [currentModelLabel, setCurrentModelLabel] = useState(getModelLabel());

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

  const modelItems = AVAILABLE_MODELS.map((m) => ({
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

  const handleModelSelect = (item: { value: string }) => {
    setModel(item.value as ModelId);
    setCurrentModelLabel(getModelLabel());
    setShowModelPicker(false);
  };

  useInput((ch, key) => {
    if (showModelPicker && key.escape) {
      setShowModelPicker(false);
      return;
    }
    if (!showModelPicker && ch === 'm') {
      setShowModelPicker(true);
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
          <SelectInput items={modelItems} onSelect={handleModelSelect} />
        </Box>
      ) : !loaded ? (
        <Text color="gray">Loading...</Text>
      ) : (
        <SelectInput items={items} onSelect={handleSelect} />
      )}

      <StatusBar
        screen="Home"
        hint={showModelPicker ? '↑↓: select  ⏎: choose  esc: back' : '↑↓: select  ⏎: choose  m: model'}
        model={currentModelLabel}
      />
    </Box>
  );
}
