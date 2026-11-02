import { ServiceUnavailableException } from '@nestjs/common';
import { Worker } from 'node:worker_threads';

const SALT_ROUNDS = 12;
// Bcryptjs is CPU-bound even when its Promise API is used. Keep it off the
// HTTP event loop and bound both CPU use and waiting requests.
const WORKER_COUNT = 2;
const MAX_PENDING = 16;

type PasswordTask = {
  action: 'hash' | 'compare';
  plainText: string;
  hash?: string;
  resolve: (value: string | boolean) => void;
  reject: (error: Error) => void;
};

type WorkerSlot = { worker: Worker; current?: PasswordTask };

const workerSource = `
const { parentPort, workerData } = require('node:worker_threads');
const bcrypt = require(workerData.bcryptModule);
parentPort.on('message', async ({ action, plainText, hash, rounds }) => {
  try {
    const value = action === 'hash'
      ? await bcrypt.hash(plainText, rounds)
      : await bcrypt.compare(plainText, hash);
    parentPort.postMessage({ value });
  } catch (error) {
    parentPort.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
});
`;

class PasswordWorkers {
  private readonly slots: WorkerSlot[] = [];
  private readonly pending: PasswordTask[] = [];

  run(
    action: PasswordTask['action'],
    plainText: string,
    hash?: string,
  ): Promise<string | boolean> {
    const idle = this.slots.find((slot) => !slot.current);
    if (
      !idle &&
      this.slots.length >= WORKER_COUNT &&
      this.pending.length >= MAX_PENDING
    ) {
      throw new ServiceUnavailableException(
        'Authentication is busy; retry shortly',
      );
    }
    return new Promise((resolve, reject) => {
      const task: PasswordTask = { action, plainText, hash, resolve, reject };
      if (idle) this.start(idle, task);
      else if (this.slots.length < WORKER_COUNT)
        this.start(this.createSlot(), task);
      else this.pending.push(task);
    });
  }

  private createSlot(): WorkerSlot {
    const worker = new Worker(workerSource, {
      eval: true,
      workerData: { bcryptModule: require.resolve('bcryptjs') },
    });
    const slot: WorkerSlot = { worker };
    this.slots.push(slot);
    worker.on(
      'message',
      (message: { value?: string | boolean; error?: string }) => {
        const task = slot.current;
        slot.current = undefined;
        worker.unref();
        if (!task) return;
        if (message.error) task.reject(new Error(message.error));
        else task.resolve(message.value as string | boolean);
        this.drain();
      },
    );
    worker.on('error', (error: Error) => this.failed(slot, error));
    worker.on('exit', (code: number) => {
      if (this.slots.includes(slot))
        this.failed(slot, new Error(`Password worker exited (${code})`));
    });
    worker.unref();
    return slot;
  }

  private start(slot: WorkerSlot, task: PasswordTask): void {
    slot.current = task;
    slot.worker.ref();
    slot.worker.postMessage({
      action: task.action,
      plainText: task.plainText,
      hash: task.hash,
      rounds: SALT_ROUNDS,
    });
  }

  private drain(): void {
    while (this.pending.length) {
      const idle = this.slots.find((slot) => !slot.current);
      if (!idle) return;
      this.start(idle, this.pending.shift()!);
    }
  }

  private failed(slot: WorkerSlot, error: Error): void {
    const index = this.slots.indexOf(slot);
    if (index < 0) return;
    this.slots.splice(index, 1);
    slot.current?.reject(error);
    slot.current = undefined;
    if (this.pending.length)
      this.start(this.createSlot(), this.pending.shift()!);
  }
}

const workers = new PasswordWorkers();

export async function hashPassword(plainText: string): Promise<string> {
  return (await workers.run('hash', plainText)) as string;
}

export async function comparePassword(
  plainText: string,
  hash: string,
): Promise<boolean> {
  return (await workers.run('compare', plainText, hash)) as boolean;
}
