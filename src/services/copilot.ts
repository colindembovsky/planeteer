import { CopilotClient } from '@github/copilot-sdk';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type { ChatMessage } from '../models/plan.js';

const SETTINGS_PATH = join(process.cwd(), '.planeteer', 'settings.json');

interface Settings {
  model?: string;
}

async function loadSettings(): Promise<Settings> {
  try {
    if (existsSync(SETTINGS_PATH)) {
      const raw = await readFile(SETTINGS_PATH, 'utf-8');
      return JSON.parse(raw) as Settings;
    }
  } catch { /* ignore */ }
  return {};
}

async function saveSettings(settings: Settings): Promise<void> {
  const dir = join(process.cwd(), '.planeteer');
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
  await writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
}

export interface ModelEntry {
  id: string;
  label: string;
}

let cachedModels: ModelEntry[] | null = null;

/** Fetch available models from the Copilot SDK. Results are cached after the first call. */
export async function fetchModels(): Promise<ModelEntry[]> {
  if (cachedModels) return cachedModels;

  const c = await getClient();
  const models = await c.listModels();

  cachedModels = models
    .filter((m: { policy?: { state: string } }) => m.policy?.state !== 'disabled')
    .map((m: { id: string; name: string }) => ({ id: m.id, label: m.name }));

  return cachedModels;
}

let currentModel = 'claude-sonnet-4';
let settingsLoaded = false;

export function getModel(): string {
  return currentModel;
}

export function setModel(model: string): void {
  currentModel = model;
  saveSettings({ model }).catch(() => {});
}

/** Load persisted model preference. Call once at startup. */
export async function loadModelPreference(): Promise<void> {
  if (settingsLoaded) return;
  settingsLoaded = true;
  const settings = await loadSettings();
  if (settings.model) {
    currentModel = settings.model;
  }
}

export function getModelLabel(): string {
  if (cachedModels) {
    return cachedModels.find((m) => m.id === currentModel)?.label ?? currentModel;
  }
  return currentModel;
}

let client: CopilotClient | null = null;

export async function getClient(): Promise<CopilotClient> {
  if (!client) {
    client = new CopilotClient();
    await client.start();
  }
  return client;
}

export async function stopClient(): Promise<void> {
  if (client) {
    await client.stop();
    client = null;
  }
}

export interface StreamCallbacks {
  onDelta: (text: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: Error) => void;
}

export async function sendPrompt(
  systemPrompt: string,
  messages: ChatMessage[],
  callbacks: StreamCallbacks,
): Promise<void> {
  let copilot: CopilotClient;
  try {
    copilot = await getClient();
  } catch (err) {
    callbacks.onError(new Error(`Failed to start Copilot client: ${(err as Error).message}`));
    return;
  }

  let session;
  try {
    session = await copilot.createSession({
      model: currentModel,
      streaming: true,
    });
  } catch (err) {
    callbacks.onError(new Error(`Failed to create session: ${(err as Error).message}`));
    return;
  }

  let fullText = '';
  let settled = false;

  session.on('assistant.message_delta', (event: { data: { deltaContent: string } }) => {
    fullText += event.data.deltaContent;
    callbacks.onDelta(event.data.deltaContent);
  });

  session.on('session.idle', () => {
    if (settled) return;
    settled = true;
    callbacks.onDone(fullText);
  });

  session.on('session.error', (event: { data: { message: string } }) => {
    if (settled) return;
    settled = true;
    callbacks.onError(new Error(event.data.message));
  });

  const prompt = [
    { role: 'system' as const, content: systemPrompt },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ]
    .map((m) => `[${m.role}]: ${m.content}`)
    .join('\n');

  try {
    await session.sendAndWait({ prompt });
  } catch (err) {
    if (settled) return;
    settled = true;
    callbacks.onError(new Error(`Request failed: ${(err as Error).message}`));
  }
}

export async function sendPromptSync(
  systemPrompt: string,
  messages: ChatMessage[],
  options?: { timeoutMs?: number; onDelta?: (delta: string, fullText: string) => void },
): Promise<string> {
  const timeoutMs = options?.timeoutMs ?? 120_000;
  const onDelta = options?.onDelta;

  return new Promise((resolve, reject) => {
    let settled = false;
    let accumulated = '';
    let timer: ReturnType<typeof setTimeout> | undefined;

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s — the model may be overloaded. Try again or switch to a different model.`));
        }
      }, timeoutMs);
    }

    sendPrompt(systemPrompt, messages, {
      onDelta: (delta) => {
        accumulated += delta;
        onDelta?.(delta, accumulated);
        // Activity received — reset timeout if we have one
        if (timer && timeoutMs > 0) {
          clearTimeout(timer);
          timer = setTimeout(() => {
            if (!settled) {
              settled = true;
              reject(new Error(`Request timed out after receiving partial response — the model may be overloaded. Try again or switch to a different model.`));
            }
          }, timeoutMs);
        }
      },
      onDone: (text) => {
        if (!settled) {
          settled = true;
          if (timer) clearTimeout(timer);
          resolve(text);
        }
      },
      onError: (err) => {
        if (!settled) {
          settled = true;
          if (timer) clearTimeout(timer);
          reject(err);
        }
      },
    });
  });
}
