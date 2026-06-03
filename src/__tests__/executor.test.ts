import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ExecOutcome, RunCommandArgs } from '../types.js';

// Load runCommand fresh with the current process.env (config is read at module load).
async function loadRunCommand(): Promise<(args: RunCommandArgs) => Promise<ExecOutcome>> {
  vi.resetModules();
  const mod = await import('../executor.js');
  return mod.runCommand;
}

let savedEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  savedEnv = { ...process.env };
  // Clear all TERMINAL_* so each test sets its own.
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('TERMINAL_')) delete process.env[k];
  }
});

afterEach(() => {
  process.env = savedEnv;
});

describe('runCommand', () => {
  it('basic echo', async () => {
    process.env.TERMINAL_DEFAULT_CWD = os.homedir();
    const runCommand = await loadRunCommand();
    const out = await runCommand({ command: 'echo Whatsup' });
    expect(out.status).toBe('success');
    if (out.status !== 'success') return;
    expect(out.data.stdout).toBe('Whatsup\n');
    expect(out.data.exit_code).toBe(0);
    expect(out.data.timed_out).toBe(false);
  });

  it('honors working_directory', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'tdxt-'));
    try {
      const runCommand = await loadRunCommand();
      const out = await runCommand({ command: 'pwd', working_directory: dir });
      expect(out.status).toBe('success');
      if (out.status !== 'success') return;
      // macOS /tmp is a symlink to /private/tmp; compare the resolved real path.
      expect(out.data.stdout.trim()).toBe(out.data.working_directory);
      expect(out.data.working_directory).toBe(path.resolve(dir));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('tilde expansion resolves to homedir', async () => {
    const runCommand = await loadRunCommand();
    const out = await runCommand({ command: 'pwd', working_directory: '~' });
    expect(out.status).toBe('success');
    if (out.status !== 'success') return;
    expect(out.data.working_directory).toBe(path.resolve(os.homedir()));
  });

  it('relative cwd resolves against TERMINAL_DEFAULT_CWD, not process.cwd', async () => {
    const base = mkdtempSync(path.join(os.tmpdir(), 'tdxt-base-'));
    const sub = path.join(base, 'sub');
    mkdirSync(sub);
    try {
      process.env.TERMINAL_DEFAULT_CWD = base;
      const runCommand = await loadRunCommand();
      const out = await runCommand({ command: 'pwd', working_directory: 'sub' });
      expect(out.status).toBe('success');
      if (out.status !== 'success') return;
      expect(out.data.working_directory).toBe(path.resolve(sub));
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it('non-zero exit is data, not error', async () => {
    process.env.TERMINAL_DEFAULT_CWD = os.homedir();
    const runCommand = await loadRunCommand();
    const out = await runCommand({ command: 'exit 3' });
    expect(out.status).toBe('success');
    if (out.status !== 'success') return;
    expect(out.data.exit_code).toBe(3);
  });

  it('captures stderr separately', async () => {
    process.env.TERMINAL_DEFAULT_CWD = os.homedir();
    const runCommand = await loadRunCommand();
    const out = await runCommand({ command: 'echo oops >&2' });
    expect(out.status).toBe('success');
    if (out.status !== 'success') return;
    expect(out.data.stderr).toBe('oops\n');
    expect(out.data.stdout).toBe('');
  });

  it('captures stdout and stderr together', async () => {
    process.env.TERMINAL_DEFAULT_CWD = os.homedir();
    const runCommand = await loadRunCommand();
    const out = await runCommand({ command: 'echo out; echo err >&2' });
    expect(out.status).toBe('success');
    if (out.status !== 'success') return;
    expect(out.data.stdout).toBe('out\n');
    expect(out.data.stderr).toBe('err\n');
  });

  it('missing cwd returns cwd_not_found', async () => {
    const runCommand = await loadRunCommand();
    const out = await runCommand({ command: 'pwd', working_directory: '/no/such/dir/xyz123' });
    expect(out.status).toBe('error');
    if (out.status !== 'error') return;
    expect(out.error_code).toBe('cwd_not_found');
  });

  it('cwd that is a file returns cwd_not_directory', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'tdxt-'));
    const file = path.join(dir, 'afile.txt');
    writeFileSync(file, 'hi');
    try {
      const runCommand = await loadRunCommand();
      const out = await runCommand({ command: 'pwd', working_directory: file });
      expect(out.status).toBe('error');
      if (out.status !== 'error') return;
      expect(out.error_code).toBe('cwd_not_directory');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('forbidden cwd outside allowed_roots returns cwd_forbidden', async () => {
    const allowed = mkdtempSync(path.join(os.tmpdir(), 'tdxt-allowed-'));
    const other = mkdtempSync(path.join(os.tmpdir(), 'tdxt-other-'));
    try {
      process.env.TERMINAL_ALLOWED_ROOTS = allowed;
      const runCommand = await loadRunCommand();
      const out = await runCommand({ command: 'pwd', working_directory: other });
      expect(out.status).toBe('error');
      if (out.status !== 'error') return;
      expect(out.error_code).toBe('cwd_forbidden');
    } finally {
      rmSync(allowed, { recursive: true, force: true });
      rmSync(other, { recursive: true, force: true });
    }
  });

  it('allowed cwd inside allowed_roots succeeds', async () => {
    const allowed = mkdtempSync(path.join(os.tmpdir(), 'tdxt-allowed-'));
    try {
      process.env.TERMINAL_ALLOWED_ROOTS = allowed;
      const runCommand = await loadRunCommand();
      const out = await runCommand({ command: 'pwd', working_directory: allowed });
      expect(out.status).toBe('success');
    } finally {
      rmSync(allowed, { recursive: true, force: true });
    }
  });

  it('timeout kills the command', async () => {
    process.env.TERMINAL_DEFAULT_CWD = os.homedir();
    const runCommand = await loadRunCommand();
    const start = Date.now();
    const out = await runCommand({ command: 'sleep 5', timeout_ms: 200 });
    const elapsed = Date.now() - start;
    expect(out.status).toBe('success');
    if (out.status !== 'success') return;
    expect(out.data.timed_out).toBe(true);
    expect(out.data.exit_code).toBe(null);
    expect(out.data.signal).toBe('SIGKILL');
    expect(elapsed).toBeLessThan(2000);
  });

  it('process group kill takes down children', async () => {
    process.env.TERMINAL_DEFAULT_CWD = os.homedir();
    const runCommand = await loadRunCommand();
    const out = await runCommand({ command: 'sleep 30 & sleep 30 & wait', timeout_ms: 300 });
    expect(out.status).toBe('success');
    if (out.status !== 'success') return;
    expect(out.data.timed_out).toBe(true);
    // Best-effort: the call returns promptly rather than hanging 30s.
    expect(out.data.duration_ms).toBeLessThan(3000);
  });

  it('truncates output beyond the cap', async () => {
    process.env.TERMINAL_DEFAULT_CWD = os.homedir();
    process.env.TERMINAL_MAX_OUTPUT_BYTES = String(64 * 1024);
    const runCommand = await loadRunCommand();
    const out = await runCommand({ command: 'yes | head -c $((2*1024*1024))', timeout_ms: 10000 });
    expect(out.status).toBe('success');
    if (out.status !== 'success') return;
    expect(out.data.truncated).toBe(true);
    expect(out.data.stdout).toContain('...[truncated');
    // Bounded: cap plus the marker, well under the full 2MB.
    expect(out.data.stdout.length).toBeLessThan(200 * 1024);
  });

  it('merges per-call env', async () => {
    process.env.TERMINAL_DEFAULT_CWD = os.homedir();
    const runCommand = await loadRunCommand();
    const out = await runCommand({ command: 'echo "$FOO"', env: { FOO: 'bar' } });
    expect(out.status).toBe('success');
    if (out.status !== 'success') return;
    expect(out.data.stdout).toBe('bar\n');
  });

  it('minimal env mode passes far fewer vars', async () => {
    process.env.TERMINAL_DEFAULT_CWD = os.homedir();
    process.env.TERMINAL_ENV_MODE = 'minimal';
    const runCommand = await loadRunCommand();
    const out = await runCommand({ command: 'env | grep -c .' });
    expect(out.status).toBe('success');
    if (out.status !== 'success') return;
    const count = parseInt(out.data.stdout.trim(), 10);
    // minimal keeps at most PATH, HOME, USER, SHELL, LANG, TERM (plus a couple shell-set ones).
    expect(count).toBeLessThan(15);
  });

  it('handles a literal ${HOME} default (host did not substitute) by using the home directory', async () => {
    process.env.TERMINAL_DEFAULT_CWD = '${HOME}';
    const runCommand = await loadRunCommand();
    const out = await runCommand({ command: 'pwd' });
    expect(out.status).toBe('success');
    if (out.status !== 'success') return;
    expect(out.data.working_directory).toBe(path.resolve(os.homedir()));
  });

  it('falls back to homedir when the default cwd contains an unresolvable placeholder', async () => {
    process.env.TERMINAL_DEFAULT_CWD = '${DEFINITELY_NOT_SET_XYZ_123}';
    const runCommand = await loadRunCommand();
    const out = await runCommand({ command: 'pwd' });
    expect(out.status).toBe('success');
    if (out.status !== 'success') return;
    expect(out.data.working_directory).toBe(path.resolve(os.homedir()));
  });

  it('falls back to homedir when the default cwd points at a nonexistent directory', async () => {
    process.env.TERMINAL_DEFAULT_CWD = '/no/such/default/dir/xyz123';
    const runCommand = await loadRunCommand();
    const out = await runCommand({ command: 'pwd' });
    expect(out.status).toBe('success');
    if (out.status !== 'success') return;
    expect(out.data.working_directory).toBe(path.resolve(os.homedir()));
  });
});
