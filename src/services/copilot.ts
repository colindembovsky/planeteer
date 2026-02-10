import { CopilotClient } from '@github/copilot-sdk';
import type { ChatMessage } from '../models/plan.js';

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
      model: 'gpt-5',
      streaming: true,
    });
  } catch (err) {
    callbacks.onError(new Error(`Failed to create session: ${(err as Error).message}`));
    return;
  }

  let fullText = '';

  session.on('assistant.message_delta', (event: { data: { deltaContent: string } }) => {
    fullText += event.data.deltaContent;
    callbacks.onDelta(event.data.deltaContent);
  });

  session.on('session.idle', () => {
    callbacks.onDone(fullText);
  });

  session.on('session.error', (event: { data: { message: string } }) => {
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
    callbacks.onError(new Error(`Request failed: ${(err as Error).message}`));
  }
}

export async function sendPromptSync(
  systemPrompt: string,
  messages: ChatMessage[],
): Promise<string> {
  return new Promise((resolve, reject) => {
    sendPrompt(systemPrompt, messages, {
      onDelta: () => {},
      onDone: resolve,
      onError: reject,
    });
  });
}
