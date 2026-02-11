import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { Task } from '../models/plan.js';

type EditField = 'title' | 'description' | 'acceptance' | 'dependsOn';

const FIELDS: { key: EditField; label: string }[] = [
  { key: 'title', label: 'Title' },
  { key: 'description', label: 'Description' },
  { key: 'acceptance', label: 'Acceptance Criteria' },
  { key: 'dependsOn', label: 'Dependencies' },
];

interface TaskEditorProps {
  task: Task;
  allTaskIds: string[];
  onSave: (updated: Task) => void;
  onCancel: () => void;
}

export default function TaskEditor({ task, allTaskIds, onSave, onCancel }: TaskEditorProps): React.ReactElement {
  const [fieldIndex, setFieldIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  // Working copy
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [acceptanceCriteria, setAcceptanceCriteria] = useState([...task.acceptanceCriteria]);
  const [dependsOn, setDependsOn] = useState([...task.dependsOn]);

  // For acceptance criteria editing
  const [acIndex, setAcIndex] = useState(0);
  const [acMode, setAcMode] = useState<'list' | 'edit' | 'add'>('list');

  useInput((ch, key) => {
    if (editing) return; // TextInput handles input

    if (key.escape) {
      if (acMode !== 'list' && FIELDS[fieldIndex]!.key === 'acceptance') {
        setAcMode('list');
        return;
      }
      onCancel();
      return;
    }

    if (key.return) {
      const field = FIELDS[fieldIndex]!.key;

      if (field === 'title') {
        setEditValue(title);
        setEditing(true);
      } else if (field === 'description') {
        setEditValue(description);
        setEditing(true);
      } else if (field === 'acceptance') {
        if (acMode === 'list') {
          if (acceptanceCriteria.length > 0) {
            setEditValue(acceptanceCriteria[acIndex] || '');
            setAcMode('edit');
            setEditing(true);
          }
        }
      } else if (field === 'dependsOn') {
        setEditValue(dependsOn.join(', '));
        setEditing(true);
      }
      return;
    }

    if (key.upArrow) {
      if (FIELDS[fieldIndex]!.key === 'acceptance' && acMode === 'list' && acceptanceCriteria.length > 0) {
        setAcIndex((i) => Math.max(0, i - 1));
      } else {
        setFieldIndex((i) => Math.max(0, i - 1));
      }
    } else if (key.downArrow) {
      if (FIELDS[fieldIndex]!.key === 'acceptance' && acMode === 'list' && acceptanceCriteria.length > 0) {
        setAcIndex((i) => Math.min(acceptanceCriteria.length - 1, i + 1));
      } else {
        setFieldIndex((i) => Math.min(FIELDS.length - 1, i + 1));
      }
    } else if (ch === 'a' && FIELDS[fieldIndex]!.key === 'acceptance') {
      setEditValue('');
      setAcMode('add');
      setEditing(true);
    } else if (ch === 'd' && FIELDS[fieldIndex]!.key === 'acceptance' && acceptanceCriteria.length > 0) {
      const updated = acceptanceCriteria.filter((_, i) => i !== acIndex);
      setAcceptanceCriteria(updated);
      setAcIndex(Math.min(acIndex, updated.length - 1));
      // Auto-save after delete
      onSave({
        ...task,
        title,
        description,
        acceptanceCriteria: updated,
        dependsOn,
      });
    }
  });

  const handleEditSubmit = (value: string) => {
    const field = FIELDS[fieldIndex]!.key;

    let newTitle = title;
    let newDescription = description;
    let newAcceptanceCriteria = acceptanceCriteria;
    let newDependsOn = dependsOn;

    if (field === 'title') {
      newTitle = value;
      setTitle(value);
    } else if (field === 'description') {
      newDescription = value;
      setDescription(value);
    } else if (field === 'acceptance') {
      if (acMode === 'edit') {
        const updated = [...acceptanceCriteria];
        updated[acIndex] = value;
        newAcceptanceCriteria = updated;
        setAcceptanceCriteria(updated);
        setAcMode('list');
      } else if (acMode === 'add') {
        if (value.trim()) {
          newAcceptanceCriteria = [...acceptanceCriteria, value.trim()];
          setAcceptanceCriteria(newAcceptanceCriteria);
          setAcIndex(acceptanceCriteria.length);
        }
        setAcMode('list');
      }
    } else if (field === 'dependsOn') {
      const deps = value
        .split(',')
        .map((d) => d.trim())
        .filter((d) => d && allTaskIds.includes(d) && d !== task.id);
      newDependsOn = deps;
      setDependsOn(deps);
    }

    setEditing(false);
    setEditValue('');

    // Auto-save on every edit confirmation
    onSave({
      ...task,
      title: newTitle,
      description: newDescription,
      acceptanceCriteria: newAcceptanceCriteria,
      dependsOn: newDependsOn,
    });
  };

  return (
    <Box flexDirection="column" marginLeft={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">Edit Task: </Text>
        <Text bold>{task.id}</Text>
      </Box>

      {FIELDS.map((field, i) => {
        const isActive = i === fieldIndex;
        const indicator = isActive ? '▸ ' : '  ';

        if (field.key === 'title') {
          return (
            <Box key={field.key}>
              <Text color={isActive ? 'green' : 'gray'}>{indicator}</Text>
              <Text color="cyan" bold>{field.label}: </Text>
              {editing && isActive ? (
                <TextInput value={editValue} onChange={setEditValue} onSubmit={handleEditSubmit} />
              ) : (
                <Text>{title}</Text>
              )}
            </Box>
          );
        }

        if (field.key === 'description') {
          return (
            <Box key={field.key}>
              <Text color={isActive ? 'green' : 'gray'}>{indicator}</Text>
              <Text color="cyan" bold>{field.label}: </Text>
              {editing && isActive ? (
                <TextInput value={editValue} onChange={setEditValue} onSubmit={handleEditSubmit} />
              ) : (
                <Text>{description || '(empty)'}</Text>
              )}
            </Box>
          );
        }

        if (field.key === 'acceptance') {
          return (
            <Box key={field.key} flexDirection="column">
              <Box>
                <Text color={isActive ? 'green' : 'gray'}>{indicator}</Text>
                <Text color="cyan" bold>{field.label}:</Text>
                {isActive && <Text color="gray"> (⏎: edit  a: add  d: delete)</Text>}
              </Box>
              {acceptanceCriteria.map((ac, j) => {
                const isAcSelected = isActive && acMode === 'list' && j === acIndex;
                return (
                  <Box key={j} marginLeft={4}>
                    {editing && isActive && acMode === 'edit' && j === acIndex ? (
                      <Box>
                        <Text color="green">• </Text>
                        <TextInput value={editValue} onChange={setEditValue} onSubmit={handleEditSubmit} />
                      </Box>
                    ) : (
                      <Text inverse={isAcSelected} bold={isAcSelected}>
                        • {ac}
                      </Text>
                    )}
                  </Box>
                );
              })}
              {editing && isActive && acMode === 'add' && (
                <Box marginLeft={4}>
                  <Text color="green">• </Text>
                  <TextInput value={editValue} onChange={setEditValue} onSubmit={handleEditSubmit} />
                </Box>
              )}
              {acceptanceCriteria.length === 0 && !editing && (
                <Box marginLeft={4}>
                  <Text color="gray">(none)</Text>
                </Box>
              )}
            </Box>
          );
        }

        if (field.key === 'dependsOn') {
          return (
            <Box key={field.key}>
              <Text color={isActive ? 'green' : 'gray'}>{indicator}</Text>
              <Text color="cyan" bold>{field.label}: </Text>
              {editing && isActive ? (
                <TextInput value={editValue} onChange={setEditValue} onSubmit={handleEditSubmit} />
              ) : (
                <Text>{dependsOn.length > 0 ? dependsOn.join(', ') : '(none)'}</Text>
              )}
            </Box>
          );
        }

        return null;
      })}

      <Box marginTop={1}>
        <Text color="gray">↑↓: field  ⏎: edit (auto-saves)  esc: done</Text>
      </Box>
    </Box>
  );
}
