import React, { useState } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import type { Plan } from '../models/plan.js';
import { listPlans } from '../services/persistence.js';
import StatusBar from '../components/status-bar.js';

interface HomeScreenProps {
  onNewPlan: () => void;
  onLoadPlan: (id: string) => void;
}

export default function HomeScreen({ onNewPlan, onLoadPlan }: HomeScreenProps): React.ReactElement {
  const [savedPlans, setSavedPlans] = useState<{ id: string; name: string; updatedAt: string }[]>([]);
  const [loaded, setLoaded] = useState(false);

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

  const handleSelect = (item: { value: string }) => {
    if (item.value === '__new__') {
      onNewPlan();
    } else {
      onLoadPlan(item.value);
    }
  };

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="green">🌍 Planeteer</Text>
        <Text color="gray"> — AI-powered work breakdown</Text>
      </Box>

      {!loaded ? (
        <Text color="gray">Loading...</Text>
      ) : (
        <SelectInput items={items} onSelect={handleSelect} />
      )}

      <StatusBar screen="Home" hint="↑↓: select  ⏎: choose" />
    </Box>
  );
}
