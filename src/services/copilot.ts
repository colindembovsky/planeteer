import { CopilotClient } from '@github/copilot-sdk';
import type { SessionEvent } from '@github/copilot-sdk';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type { ChatMessage } from '../models/plan.js';
import { locateCopilotCli, type CliInfo } from '../utils/cli-locator.js';

// Re-export SessionEvent for use in other modules
export type { SessionEvent };

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
let clientPromise: Promise<CopilotClient> | null = null;
let cliLocation: CliInfo | null = null;

/** Initialize CLI location info early (doesn't start the client). */
export function initCliInfo(): void {
  if (!cliLocation) {
    const location = locateCopilotCli();
    if (location) {
      cliLocation = location;
    }
  }
}

/** Get information about the CLI being used. */
export function getCliInfo(): CliInfo | null {
  // Initialize on first access if not already done
  if (!cliLocation) {
    initCliInfo();
  }
  return cliLocation;
}

export async function getClient(): Promise<CopilotClient> {
  if (client) return client;
  if (clientPromise) return clientPromise;

  clientPromise = (async () => {
    // Initialize CLI location if not already done
    initCliInfo();
    
    // Use the cached location
    if (!cliLocation) {
      throw new Error(
        'GitHub Copilot CLI not found.\n\n' +
        'The bundled CLI should be automatically available, but it appears to be missing.\n' +
        'Please try:\n' +
        '  1. Reinstalling dependencies: npm install\n' +
        '  2. Installing the CLI globally: npm install -g @github/copilot\n\n' +
        'If the problem persists, please report this issue.'
      );
    }

    // Create client with the located CLI path
    const c = new CopilotClient({
      cliPath: cliLocation.path,
    });
    
    try {
      await c.start();
    } catch (err) {
      const message = (err as Error).message || 'Unknown error';
      throw new Error(
        `Failed to start GitHub Copilot CLI.\n\n` +
        `Error: ${message}\n\n` +
        `The CLI was found at: ${cliLocation.path}\n` +
        `Version: ${cliLocation.version}\n` +
        `Source: ${cliLocation.source}\n\n` +
        `Please ensure you have:\n` +
        `  1. Authenticated with GitHub Copilot (the CLI will prompt you)\n` +
        `  2. Active GitHub Copilot subscription\n` +
        `  3. Proper permissions to execute the CLI binary`
      );
    }
    
    client = c;
    return c;
  })();

  return clientPromise;
}

export async function stopClient(): Promise<void> {
  if (clientPromise) {
    await clientPromise.catch(() => {});
    clientPromise = null;
  }
  if (client) {
    await client.stop();
    client = null;
  }
}

export interface StreamCallbacks {
  onDelta: (text: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: Error) => void;
  onSessionEvent?: (event: SessionEvent) => void;
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

  // Listen for session events if callback provided, but avoid forwarding
  // high-volume delta events that are already handled by onDelta.
  if (callbacks.onSessionEvent) {
    session.on((event: SessionEvent) => {
      if (event.type === 'assistant.message_delta') {
        return;
      }
      callbacks.onSessionEvent?.(event);
    });
  }

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
  options?: { 
    timeoutMs?: number; 
    onDelta?: (delta: string, fullText: string) => void;
    onSessionEvent?: (event: SessionEvent) => void;
  },
): Promise<string> {
  const idleTimeoutMs = options?.timeoutMs ?? 120_000;
  const onDelta = options?.onDelta;
  const onSessionEvent = options?.onSessionEvent;

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
      onSessionEvent,
    });
  });
}
