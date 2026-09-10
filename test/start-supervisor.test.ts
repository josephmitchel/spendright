import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { createServer, type AddressInfo, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const stubBin = join(repoRoot, 'test', 'stub-server.mjs');
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

interface Supervisor {
  child: ChildProcess;
  output: () => string;
  waitForOutput: (pattern: string, timeoutMs?: number) => Promise<void>;
  waitForExit: (timeoutMs?: number) => Promise<number | null>;
}

const running: ChildProcess[] = [];

function startSupervisor(
  port: number,
  env: Record<string, string> = {},
  extraArgs: string[] = [],
): Supervisor {
  const child = spawn(
    process.execPath,
    [join(repoRoot, 'scripts', 'start.mjs'), '-p', String(port), ...extraArgs],
    {
      cwd: repoRoot,
      env: { ...process.env, SPENDRIGHT_SERVER_BIN: stubBin, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  running.push(child);
  let buffer = '';
  child.stdout?.on('data', (chunk: Buffer) => (buffer += String(chunk)));
  child.stderr?.on('data', (chunk: Buffer) => (buffer += String(chunk)));

  return {
    child,
    output: () => buffer,
    waitForOutput: async (pattern, timeoutMs = 10_000) => {
      const deadline = Date.now() + timeoutMs;
      while (!buffer.includes(pattern)) {
        if (Date.now() > deadline) {
          throw new Error(`"${pattern}" never appeared; output so far:\n${buffer}`);
        }
        await sleep(50);
      }
    },
    waitForExit: (timeoutMs = 10_000) =>
      new Promise((resolve, reject) => {
        if (child.exitCode !== null) return resolve(child.exitCode);
        const timer = setTimeout(
          () => reject(new Error(`supervisor did not exit; output:\n${buffer}`)),
          timeoutMs,
        );
        child.once('exit', (code) => {
          clearTimeout(timer);
          resolve(code);
        });
      }),
  };
}

async function pollFetch(port: number, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1000) });
      return;
    } catch {
      if (Date.now() > deadline) throw new Error(`nothing served on port ${port}`);
      await sleep(100);
    }
  }
}

afterEach(async () => {
  for (const child of running.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      // SIGTERM lets the supervisor take its stub down with it.
      child.kill('SIGTERM');
      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          child.kill('SIGKILL');
          resolve(undefined);
        }, 3000);
        child.once('exit', () => {
          clearTimeout(timer);
          resolve(undefined);
        });
      });
    }
  }
});

describe('start.mjs supervisor', () => {
  it('warms the server up and shuts down cleanly on SIGTERM', async () => {
    const port = await freePort();
    const supervisor = startSupervisor(port);

    await pollFetch(port);
    supervisor.child.kill('SIGTERM');
    expect(await supervisor.waitForExit()).toBe(1);
    expect(supervisor.output()).not.toContain('restarting');
  });

  it('kills a server that never answers the warm-up and exits 1', async () => {
    const port = await freePort();
    const supervisor = startSupervisor(port, {
      STUB_SERVER_MODE: 'never-listen',
      SPENDRIGHT_WARMUP_DEADLINE_MS: '1500',
    });

    await supervisor.waitForOutput('no response from');
    expect(await supervisor.waitForExit()).toBe(1);
    expect(supervisor.output()).toContain('the warm-up that starts');
    expect(supervisor.output()).toContain('Stopping the server');
  });

  it('restarts once after an unexpected exit and serves again', async () => {
    const port = await freePort();
    const stateFile = join(mkdtempSync(join(tmpdir(), 'spendright-stub-')), 'first-run');
    const supervisor = startSupervisor(port, {
      STUB_SERVER_MODE: 'exit-after-first-response',
      STUB_STATE_FILE: stateFile,
    });

    await supervisor.waitForOutput('exited unexpectedly (code 7) — restarting in 1s');
    await pollFetch(port);

    supervisor.child.kill('SIGTERM');
    expect(await supervisor.waitForExit()).toBe(1);
  });

  it('gives up after 3 exits within 60s instead of crash-looping', async () => {
    const port = await freePort();
    const supervisor = startSupervisor(port, { STUB_SERVER_MODE: 'crash' });

    await supervisor.waitForOutput('exited 3 times within 60s', 15_000);
    expect(await supervisor.waitForExit()).toBe(1);
    expect(supervisor.output()).toContain('restarting in 1s');
  });

  it('fails fast with a clear message when the port is already in use', async () => {
    const port = await freePort();
    const holder: Server = createServer();
    await new Promise<void>((resolve) => holder.listen(port, '127.0.0.1', resolve));
    try {
      const supervisor = startSupervisor(port);
      await supervisor.waitForOutput(`port ${port} is already in use`);
      expect(await supervisor.waitForExit()).toBe(1);
      expect(supervisor.output()).not.toContain('exited 3 times');
    } finally {
      await new Promise((resolve) => holder.close(resolve));
    }
  });

  it('refuses to start on an unusable port argument', async () => {
    const supervisor = startSupervisor(3000, {}, ['-p', 'abc']);
    await supervisor.waitForOutput('could not resolve a usable port');
    expect(await supervisor.waitForExit()).toBe(1);
  });
});
