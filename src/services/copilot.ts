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
    // Use send() instead of sendAndWait() — we handle idle/error/timeout
    // ourselves via event listeners above. sendAndWait has a 60s default
    // timeout that conflicts with our own idle-based timeout logic.
    await session.send({ prompt });
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
  const idleTimeoutMs = options?.timeoutMs ?? 120_000;
  const onDelta = options?.onDelta;

  return new Promise((resolve, reject) => {
    let settled = false;
    let accumulated = '';
    let lastDeltaAt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const startIdleTimer = () => {
      if (timer) clearTimeout(timer);
      if (idleTimeoutMs <= 0) return;
      timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        if (accumulated.length > 0) {
          // We have partial content — resolve with what we got
          resolve(accumulated);
        } else {
          reject(new Error(`Request timed out after ${Math.round(idleTimeoutMs / 1000)}s of inactivity — the model may be overloaded. Try again or switch to a different model.`));
        }
      }, idleTimeoutMs);
    };

    // Start the initial idle timer (waiting for first delta)
    startIdleTimer();

    sendPrompt(systemPrompt, messages, {
      onDelta: (delta) => {
        accumulated += delta;
        lastDeltaAt = Date.now();
        onDelta?.(delta, accumulated);
        // Reset idle timer — only times out if no new deltas arrive
        startIdleTimer();
      },
      onDone: (text) => {
        if (!settled) {
          settled = true;
          if (timer) clearTimeout(timer);
          resolve(text);
        }
      },
      onError: (err) => {
        if (settled) return;
        // If we have accumulated content and were recently streaming,
        // treat timeout-like errors as completion with partial content
        const recentlyActive = lastDeltaAt > 0 && (Date.now() - lastDeltaAt) < idleTimeoutMs;
        if (accumulated.length > 0 && recentlyActive) {
          settled = true;
          if (timer) clearTimeout(timer);
          resolve(accumulated);
        } else {
          settled = true;
          if (timer) clearTimeout(timer);
          reject(err);
        }
      },
    });
  });
}
