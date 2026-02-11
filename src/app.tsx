import React, { useState, useCallback } from 'react';
import { Box, useApp, useInput } from 'ink';
import type { Plan, ChatMessage, Screen } from './models/plan.js';
import { loadPlan, savePlan } from './services/persistence.js';
import { stopClient } from './services/copilot.js';
import Welcome from './components/welcome.js';
import HomeScreen from './screens/home.js';
import ClarifyScreen from './screens/clarify.js';
import BreakdownScreen from './screens/breakdown.js';
import RefineScreen from './screens/refine.js';
import ExecuteScreen from './screens/execute.js';
import ValidateScreen from './screens/validate.js';

interface AppProps {
  initialScreen?: Screen;
  initialPlanId?: string;
}

export default function App({ initialScreen, initialPlanId }: AppProps): React.ReactElement {
  const { exit } = useApp();
  const [screen, setScreen] = useState<Screen>(initialScreen || 'welcome');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [scopeDescription, setScopeDescription] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [codebaseContext, setCodebaseContext] = useState('');

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
    if (screen === 'welcome') return;
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

  const handleExecutePlan = useCallback((id: string) => {
    loadPlan(id).then((p) => {
      if (p) {
        setPlan(p);
        setScreen('execute');
      }
    });
  }, []);

  const handleValidatePlan = useCallback((id: string) => {
    loadPlan(id).then((p) => {
      if (p) {
        setPlan(p);
        setScreen('validate');
      }
    });
  }, []);

  const handleScopeConfirmed = useCallback((description: string, msgs: ChatMessage[], codeCtx: string) => {
    setScopeDescription(description);
    setMessages(msgs);
    setCodebaseContext(codeCtx);
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

  const handleValidate = useCallback((p: Plan) => {
    setPlan(p);
    setScreen('validate');
  }, []);

  return (
    <Box flexDirection="column" padding={1}>
      {screen === 'welcome' && (
        <Welcome onDone={() => setScreen('home')} />
      )}
      {screen === 'home' && (
        <HomeScreen
          onNewPlan={handleNewPlan}
          onLoadPlan={handleLoadPlan}
          onExecutePlan={handleExecutePlan}
          onValidatePlan={handleValidatePlan}
        />
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
          codebaseContext={codebaseContext}
          onPlanReady={handlePlanReady}
          onBack={() => setScreen('clarify')}
        />
      )}
      {screen === 'refine' && plan && (
        <RefineScreen
          plan={plan}
          onPlanUpdated={handlePlanUpdated}
          onExecute={handleExecute}
          onValidate={handleValidate}
          onBack={() => setScreen('breakdown')}
        />
      )}
      {screen === 'execute' && plan && (
        <ExecuteScreen
          plan={plan}
          codebaseContext={codebaseContext}
          onDone={handleExecuteDone}
          onBack={() => setScreen('refine')}
        />
      )}
      {screen === 'validate' && plan && (
        <ValidateScreen
          plan={plan}
          onBack={() => setScreen('refine')}
        />
      )}
    </Box>
  );
}
