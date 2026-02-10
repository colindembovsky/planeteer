import React, { useState, useCallback } from 'react';
import { Box, useApp, useInput } from 'ink';
import type { Plan, ChatMessage, Screen } from './models/plan.js';
import { loadPlan, savePlan } from './services/persistence.js';
import { stopClient } from './services/copilot.js';
import HomeScreen from './screens/home.js';
import ClarifyScreen from './screens/clarify.js';
import BreakdownScreen from './screens/breakdown.js';
import RefineScreen from './screens/refine.js';
import ExecuteScreen from './screens/execute.js';

interface AppProps {
  initialScreen?: Screen;
  initialPlanId?: string;
}

export default function App({ initialScreen, initialPlanId }: AppProps): React.ReactElement {
  const { exit } = useApp();
  const [screen, setScreen] = useState<Screen>(initialScreen || 'home');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [scopeDescription, setScopeDescription] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Load plan if initialPlanId provided
  React.useEffect(() => {
    if (initialPlanId) {
      loadPlan(initialPlanId).then((p) => {
        if (p) {
          setPlan(p);
          setScreen('refine');
        }
      });
    }
  }, [initialPlanId]);

  useInput((ch) => {
    if (ch === 'q') {
      stopClient().then(() => exit());
    }
  });

  const handleNewPlan = useCallback(() => setScreen('clarify'), []);

  const handleLoadPlan = useCallback((id: string) => {
    loadPlan(id).then((p) => {
      if (p) {
        setPlan(p);
        setScreen('refine');
      }
    });
  }, []);

  const handleScopeConfirmed = useCallback((description: string, msgs: ChatMessage[]) => {
    setScopeDescription(description);
    setMessages(msgs);
    setScreen('breakdown');
  }, []);

  const handlePlanReady = useCallback((p: Plan) => {
    setPlan(p);
    savePlan(p);
    setScreen('refine');
  }, []);

  const handlePlanUpdated = useCallback((p: Plan) => {
    setPlan(p);
  }, []);

  const handleExecute = useCallback((p: Plan) => {
    setPlan(p);
    setScreen('execute');
  }, []);

  const handleExecuteDone = useCallback((p: Plan) => {
    setPlan(p);
    savePlan(p);
  }, []);

  return (
    <Box flexDirection="column" padding={1}>
      {screen === 'home' && (
        <HomeScreen onNewPlan={handleNewPlan} onLoadPlan={handleLoadPlan} />
      )}
      {screen === 'clarify' && (
        <ClarifyScreen
          onScopeConfirmed={handleScopeConfirmed}
          onBack={() => setScreen('home')}
        />
      )}
      {screen === 'breakdown' && (
        <BreakdownScreen
          scopeDescription={scopeDescription}
          messages={messages}
          existingPlan={plan || undefined}
          onPlanReady={handlePlanReady}
          onBack={() => setScreen('clarify')}
        />
      )}
      {screen === 'refine' && plan && (
        <RefineScreen
          plan={plan}
          onPlanUpdated={handlePlanUpdated}
          onExecute={handleExecute}
          onBack={() => setScreen('breakdown')}
        />
      )}
      {screen === 'execute' && plan && (
        <ExecuteScreen
          plan={plan}
          onDone={handleExecuteDone}
          onBack={() => setScreen('refine')}
        />
      )}
    </Box>
  );
}
