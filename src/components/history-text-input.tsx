import React, { useState, useEffect, useRef } from 'react';
import { Text, useInput } from 'ink';
import chalk from 'chalk';

interface HistoryTextInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  history: string[];
  onHistoryIndexChange?: (index: number) => void;
  focus?: boolean;
  placeholder?: string;
}

export default function HistoryTextInput({
  value: originalValue,
  onChange,
  onSubmit,
  history,
  onHistoryIndexChange,
  focus = true,
  placeholder = '',
}: HistoryTextInputProps): React.ReactElement {
  const [cursorOffset, setCursorOffset] = useState(originalValue.length);
  const historyIndexRef = useRef(-1);
  const savedInputRef = useRef('');

  useEffect(() => {
    if (cursorOffset > originalValue.length) {
      setCursorOffset(originalValue.length);
    }
  }, [originalValue, cursorOffset]);

  useInput(
    (input, key) => {
      if (
        (key.ctrl && input === 'c') ||
        key.tab ||
        (key.shift && key.tab)
      ) {
        return;
      }

      // History navigation
      if (key.upArrow) {
        if (history.length === 0) return;
        if (historyIndexRef.current === -1) {
          savedInputRef.current = originalValue;
        }
        const newIndex =
          historyIndexRef.current === -1
            ? history.length - 1
            : Math.max(0, historyIndexRef.current - 1);
        historyIndexRef.current = newIndex;
        onHistoryIndexChange?.(newIndex);
        const historyValue = history[newIndex]!;
        onChange(historyValue);
        setCursorOffset(historyValue.length);
        return;
      }

      if (key.downArrow) {
        if (historyIndexRef.current === -1) return;
        const newIndex = historyIndexRef.current + 1;
        if (newIndex >= history.length) {
          historyIndexRef.current = -1;
          onHistoryIndexChange?.(-1);
          onChange(savedInputRef.current);
          setCursorOffset(savedInputRef.current.length);
        } else {
          historyIndexRef.current = newIndex;
          onHistoryIndexChange?.(newIndex);
          const historyValue = history[newIndex]!;
          onChange(historyValue);
          setCursorOffset(historyValue.length);
        }
        return;
      }

      if (key.return) {
        historyIndexRef.current = -1;
        savedInputRef.current = '';
        onSubmit?.(originalValue);
        return;
      }

      let nextCursorOffset = cursorOffset;
      let nextValue = originalValue;

      if (key.leftArrow) {
        nextCursorOffset = Math.max(0, cursorOffset - 1);
      } else if (key.rightArrow) {
        nextCursorOffset = Math.min(originalValue.length, cursorOffset + 1);
      } else if (key.backspace || key.delete) {
        if (cursorOffset > 0) {
          nextValue =
            originalValue.slice(0, cursorOffset - 1) +
            originalValue.slice(cursorOffset);
          nextCursorOffset = cursorOffset - 1;
        }
      } else {
        nextValue =
          originalValue.slice(0, cursorOffset) +
          input +
          originalValue.slice(cursorOffset);
        nextCursorOffset = cursorOffset + input.length;
      }

      setCursorOffset(nextCursorOffset);
      if (nextValue !== originalValue) {
        // Reset history browsing on edit
        historyIndexRef.current = -1;
        savedInputRef.current = '';
        onChange(nextValue);
      }
    },
    { isActive: focus },
  );

  // Render with cursor
  const value = originalValue;
  let renderedValue: string;
  let renderedPlaceholder: string | undefined = placeholder
    ? chalk.grey(placeholder)
    : undefined;

  if (focus) {
    renderedPlaceholder =
      placeholder.length > 0
        ? chalk.inverse(placeholder[0]) + chalk.grey(placeholder.slice(1))
        : chalk.inverse(' ');

    if (value.length === 0) {
      renderedValue = chalk.inverse(' ');
    } else {
      renderedValue = '';
      let i = 0;
      for (const char of value) {
        renderedValue += i === cursorOffset ? chalk.inverse(char) : char;
        i++;
      }
      if (cursorOffset === value.length) {
        renderedValue += chalk.inverse(' ');
      }
    }
  } else {
    renderedValue = value;
  }

  return (
    <Text>
      {placeholder
        ? value.length > 0
          ? renderedValue
          : renderedPlaceholder
        : renderedValue}
    </Text>
  );
}
