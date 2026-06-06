import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const frontendDir = join(rootDir, 'frontend');
const apiPort = process.env.CRACKLEDATE_API_PORT ?? '5174';
const apiTarget = `http://127.0.0.1:${apiPort}`;

const children = new Set();
let backendProcess = null;
let restartingBackend = false;
let backendRestartTimer = null;

function startProcess(label, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: rootDir,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
    ...options,
  });

  children.add(child);
  prefixStream(label, child.stdout);
  prefixStream(label, child.stderr);

  child.once('exit', (code, signal) => {
    children.delete(child);
    if (label === 'api' && restartingBackend) {
      return;
    }

    if (signal) {
      console.log(`[${label}] stopped by ${signal}`);
      return;
    }

    if (code !== 0) {
      console.log(`[${label}] exited with code ${code}`);
    }
  });

  return child;
}

function prefixStream(label, stream) {
  createInterface({ input: stream }).on('line', (line) => {
    console.log(`[${label}] ${line}`);
  });
}

function startBackend() {
  backendProcess = startProcess('api', 'go', ['run', './cmd/server'], {
    env: {
      ...process.env,
      PORT: apiPort,
    },
  });
}

function restartBackend() {
  clearTimeout(backendRestartTimer);
  backendRestartTimer = setTimeout(async () => {
    if (!backendProcess) {
      startBackend();
      return;
    }

    console.log('[dev] backend files changed; restarting API');
    restartingBackend = true;
    await stopChild(backendProcess);
    restartingBackend = false;
    startBackend();
  }, 250);
}

function stopChild(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null) {
      resolve();
      return;
    }

    const timeout = setTimeout(() => {
      killChild(child, 'SIGKILL');
      resolve();
    }, 3000);

    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });

    killChild(child, 'SIGTERM');
  });
}

function killChild(child, signal) {
  try {
    if (process.platform === 'win32') {
      child.kill(signal);
    } else {
      process.kill(-child.pid, signal);
    }
  } catch (error) {
    if (error.code !== 'ESRCH') {
      console.error(`[dev] failed to stop process ${child.pid}: ${error.message}`);
    }
  }
}

function shouldRestartBackend(filename) {
  if (!filename) {
    return true;
  }

  return filename.endsWith('.go') || filename === 'go.mod' || filename === 'go.sum';
}

function watchBackend() {
  const watchedPaths = ['cmd', 'internal', 'go.mod'];

  for (const relativePath of watchedPaths) {
    watch(join(rootDir, relativePath), { recursive: true }, (_event, filename) => {
      if (shouldRestartBackend(String(filename ?? relativePath))) {
        restartBackend();
      }
    });
  }
}

async function shutdown() {
  clearTimeout(backendRestartTimer);
  const activeChildren = Array.from(children);
  await Promise.all(activeChildren.map(stopChild));
  process.exit(0);
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

watchBackend();
startBackend();
startProcess('web', 'npm', ['run', 'dev', '--', '--host', '127.0.0.1'], {
  cwd: frontendDir,
  env: {
    ...process.env,
    CRACKLEDATE_API_TARGET: apiTarget,
  },
});

console.log('[dev] local app: http://localhost:5173/');
console.log(`[dev] API target: ${apiTarget}`);
console.log('[dev] Vite hot reloads frontend changes; Go API restarts on backend changes.');
