import React, { useState, useCallback, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import type { ChatMessage } from '../models/plan.js';
import { streamClarification, parseClarificationResponse, type ClarificationResult } from '../services/planner.js';
import { loadHistory, addToHistory } from '../services/history.js';
import { inspectCodebase } from '../services/inspector.js';
import HistoryTextInput from '../components/history-text-input.js';
import Spinner from '../components/spinner.js';
import StatusBar from '../components/status-bar.js';

interface ClarifyScreenProps {
  onScopeConfirmed: (description: string, messages: ChatMessage[], codebaseContext: string) => void;
  onBack: () => void;
}

export default function ClarifyScreen({ onScopeConfirmed, onBack }: ClarifyScreenProps): React.ReactElement {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [currentResponse, setCurrentResponse] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [clarification, setClarification] = useState<ClarificationResult | null>(null);
  const [customMode, setCustomMode] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [codebaseContext, setCodebaseContext] = useState('');
  const [inspecting, setInspecting] = useState(false);
  const [inspectDone, setInspectDone] = useState(false);

  useEffect(() => {
    loadHistory().then(setHistory);
  }, []);

  useInput((ch, key) => {
    if (key.escape) {
      if (customMode) {
        setCustomMode(false);
      } else {
        onBack();
      }
      return;
    }
    // Number key shortcuts for menu options
    if (!streaming && !transitioning && !customMode && menuItems.length > 0) {
      const num = parseInt(ch, 10);
      if (num >= 1 && num <= menuItems.length) {
        handleOptionSelect(menuItems[num - 1]!);
      }
    }
  });

  const sendMessage = useCallback(
    (value: string) => {
      if (!value.trim() || streaming) return;

      const userMsg: ChatMessage = { role: 'user', content: value };
      const updated = [...messages, userMsg];
      setMessages(updated);
      setInput('');
      setCustomMode(false);
      setClarification(null);
      setStreaming(true);
      setCurrentResponse('');

      // Only save the initial project description to history, not clarification answers
      if (messages.length === 0) {
        addToHistory(value);
        setHistory((prev) => {
          const filtered = prev.filter((h) => h !== value);
          return [...filtered, value];
        });

        // Kick off codebase inspection in parallel with the first clarification
        setInspecting(true);
        inspectCodebase().then((snapshot) => {
          setCodebaseContext(snapshot.summary);
          setInspecting(false);
          setInspectDone(true);
        }).catch(() => {
          setInspecting(false);
          setInspectDone(true);
        });
      }

      streamClarification(updated, {
        onDelta: (delta) => {
          setCurrentResponse((prev) => prev + delta);
        },
        onDone: (fullText) => {
          const assistantMsg: ChatMessage = { role: 'assistant', content: fullText };
          const final = [...updated, assistantMsg];
          setMessages(final);
          setCurrentResponse('');
          setStreaming(false);

          const parsed = parseClarificationResponse(fullText);
          if (parsed.scopeClear) {
            setTransitioning(true);
            setTimeout(() => onScopeConfirmed(parsed.scopeClear!, final, codebaseContext), 1500);
          } else {
            setClarification(parsed);
          }
        },
        onError: (error) => {
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: `Error: ${error.message}` },
          ]);
          setStreaming(false);
        },
      }, codebaseContext || undefined).catch((error: Error) => {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `Connection error: ${error.message}` },
        ]);
        setStreaming(false);
      });
    },
    [messages, streaming, onScopeConfirmed, codebaseContext],
  );

  const handleSkipQuestions = useCallback(() => {
    // Build scope from all user messages so far
    const userMessages = messages
      .filter((m) => m.role === 'user')
      .map((m) => m.content)
      .join('\n');
    setTransitioning(true);
    setTimeout(() => onScopeConfirmed(userMessages, messages, codebaseContext), 1500);
  }, [messages, onScopeConfirmed, codebaseContext]);

  const handleOptionSelect = useCallback(
    (item: { value: string }) => {
      if (item.value === '__custom__') {
        setCustomMode(true);
      } else if (item.value === '__skip__') {
        handleSkipQuestions();
      } else {
        sendMessage(item.value);
      }
    },
    [sendMessage, handleSkipQuestions],
  );

  const menuItems = clarification?.options.length
    ? [
        ...clarification.options.map((opt, i) => ({
          label: `${i + 1}. ${opt}`,
          value: opt,
        })),
        { label: `${clarification.options.length + 1}. ✎ Type a custom answer`, value: '__custom__' },
        { label: `${clarification.options.length + 2}. 🚀 Enough questions — let's plan already!`, value: '__skip__' },
      ]
    : [];

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">Clarify Intent</Text>
        <Text color="gray"> — describe your project, Copilot will ask clarifying questions</Text>
      </Box>

      {inspecting && (
        <Box marginBottom={1}>
          <Spinner label="Inspecting existing codebase" />
        </Box>
      )}
      {inspectDone && codebaseContext && (
        <Box marginBottom={1}>
          <Text color="green">✓ </Text>
          <Text color="gray">Codebase detected — context will be included in planning</Text>
        </Box>
      )}

      <Box flexDirection="column" marginBottom={1}>
        {messages.map((msg, i) => {
          // Skip the last assistant message if we're showing it as the clarification question below
          const isLastAssistant =
            msg.role === 'assistant' && i === messages.length - 1 && clarification?.question;
          if (isLastAssistant) return null;
          const displayText =
            msg.role === 'assistant'
              ? parseClarificationResponse(msg.content).question || msg.content
              : msg.content;
          const label = msg.role === 'user' ? 'You:' : 'Copilot:';
          return (
            <Box key={i} marginBottom={1}>
              <Text wrap="wrap">
                <Text color={msg.role === 'user' ? 'green' : 'cyan'} bold>{label} </Text>
                {displayText}
              </Text>
            </Box>
          );
        })}
        {streaming && (
          <Box marginBottom={1}>
            <Spinner />
          </Box>
        )}
        {transitioning && (
          <Box marginBottom={1}>
            <Text color="green" bold>🚀 Got it! Breaking down the plan now...</Text>
          </Box>
        )}
      </Box>

      {!streaming && !transitioning && clarification?.question && (
        <Box marginBottom={1}>
          <Text wrap="wrap">
            <Text color="cyan" bold>Copilot: </Text>
            {clarification.question}
          </Text>
        </Box>
      )}

      {!streaming && !transitioning && menuItems.length > 0 && !customMode && (
        <Box flexDirection="column" marginBottom={1}>
          <SelectInput items={menuItems} onSelect={handleOptionSelect} />
        </Box>
      )}

      {!streaming && !transitioning && (customMode || !clarification || menuItems.length === 0) && (
        <Box>
          <Text color="green" bold>{'> '}</Text>
          <HistoryTextInput
            value={input}
            onChange={setInput}
            onSubmit={sendMessage}
            history={history}
            placeholder={clarification ? 'Type your answer...' : 'Describe your project...'}
          />
        </Box>
      )}

      <StatusBar
        screen="Clarify"
        hint={
          customMode
            ? '↑↓: history  esc: back to options  ⏎: send'
            : clarification
              ? '↑↓: select  ⏎: choose  esc: back'
              : '↑↓: history  esc: back  ⏎: send'
        }
      />
    </Box>
  );
}
