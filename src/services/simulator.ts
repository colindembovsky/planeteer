import React from 'react';
import { PassThrough, Writable } from 'node:stream';
import { render } from 'ink';

export interface SimulationStep {
  input: string;
  waitMs?: number;
}

export interface SimulationOptions {
  steps: SimulationStep[];
  width?: number;
  height?: number;
  settleMs?: number;
}

export interface SimulationResult {
  rawFrames: string[];
  frames: string[];
}

class SimulatedStdin extends PassThrough {
  public isTTY = true;
  public isRaw = false;

  setRawMode(mode: boolean): this {
    this.isRaw = mode;
    return this;
  }

  ref(): this {
    return this;
  }

  unref(): this {
    return this;
  }
}

class SimulatedStdout extends Writable {
  public readonly rawFrames: string[] = [];
  public readonly columns: number;
  public readonly rows: number;
  public readonly isTTY = true;

  constructor(columns: number, rows: number) {
    super();
    this.columns = columns;
    this.rows = rows;
  }

  _write(chunk: string | Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.rawFrames.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
    callback();
  }

  getColorDepth(): number {
    return 8;
  }

  hasColors(): boolean {
    return true;
  }

  cursorTo(): void {}

  moveCursor(): void {}

  clearLine(): void {}

  clearScreenDown(): void {}

  getWindowSize(): [number, number] {
    return [this.columns, this.rows];
  }

  ref(): this {
    return this;
  }

  unref(): this {
    return this;
  }
}

const ANSI_PATTERN = /\u001B\[[0-?]*[ -/]*[@-~]/g;

function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, '');
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function simulateSession(
  node: React.ReactElement,
  {
    steps,
    width = 120,
    height = 40,
    settleMs = 20,
  }: SimulationOptions,
): Promise<SimulationResult> {
  const stdin = new SimulatedStdin();
  const stdout = new SimulatedStdout(width, height);

  const app = render(node, {
    stdin: stdin as unknown as NodeJS.ReadStream,
    stdout: stdout as unknown as NodeJS.WriteStream,
    stderr: stdout as unknown as NodeJS.WriteStream,
    debug: true,
    patchConsole: false,
    exitOnCtrlC: false,
  });

  await wait(settleMs);
  for (const step of steps) {
    stdin.write(step.input);
    await wait(step.waitMs ?? settleMs);
  }

  app.unmount();
  stdin.end();
  await wait(settleMs);

  return {
    rawFrames: stdout.rawFrames,
    frames: stdout.rawFrames.map(stripAnsi),
  };
}
