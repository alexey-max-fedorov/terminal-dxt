import { spawn } from 'node:child_process';
import { existsSync, statSync, appendFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import type { ExecOutcome, RunCommandPayload, RunCommandArgs } from './types.js';

// ---- Config from env (set by manifest user_config) ----
const clampTimeout = (n: number) => Math.max(100, Math.min(600_000, n));
const DEFAULT_TIMEOUT_MS = clampTimeout(Number(process.env.TERMINAL_DEFAULT_TIMEOUT_MS) || 120_000);
const MAX_OUTPUT_BYTES = Number(process.env.TERMINAL_MAX_OUTPUT_BYTES) || 1_048_576;
const SHELL_PATH = process.env.TERMINAL_SHELL_PATH || '/bin/bash';
const LOGIN_SHELL = (process.env.TERMINAL_LOGIN_SHELL ?? 'true') !== 'false';
const ENV_MODE = process.env.TERMINAL_ENV_MODE === 'minimal' ? 'minimal' : 'full';
const AUDIT_LOG = process.env.TERMINAL_AUDIT_LOG || '';

function expandHome(p: string): string {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

// Expand ${VAR} placeholders from the real environment. The MCP host substitutes
// ${HOME} and friends in the main mcp_config, but not always in user_config defaults,
// so a literal "${HOME}" can reach us here. An unset var expands to an empty string.
function expandVars(p: string): string {
  return p.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_m, name) => process.env[name] ?? '');
}

const DEFAULT_CWD = (() => {
  const raw = expandVars(process.env.TERMINAL_DEFAULT_CWD?.trim() ?? '');
  // Empty, or a placeholder the host never resolved, means use the home directory.
  if (!raw || raw.includes('${')) return os.homedir();
  const resolved = path.resolve(expandHome(raw));
  // Defensive: if the configured default is not a real directory, fall back to home.
  try {
    if (existsSync(resolved) && statSync(resolved).isDirectory()) return resolved;
  } catch { /* fall through to home */ }
  return os.homedir();
})();

const ALLOWED_ROOTS = (process.env.TERMINAL_ALLOWED_ROOTS || '')
  .split(':')
  .map((s) => expandVars(s.trim()))
  .filter(Boolean)
  .map((p) => path.resolve(expandHome(p)));

function resolveCwd(input?: string): string {
  const raw = input && input.trim() ? expandHome(input.trim()) : DEFAULT_CWD;
  return path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(DEFAULT_CWD, raw);
}

function withinAllowedRoots(cwd: string): boolean {
  if (ALLOWED_ROOTS.length === 0) return true;
  return ALLOWED_ROOTS.some((root) => cwd === root || cwd.startsWith(root + path.sep));
}

function buildEnv(cwd: string, extra?: Record<string, string>): NodeJS.ProcessEnv {
  if (ENV_MODE === 'minimal') {
    const keep = ['PATH', 'HOME', 'USER', 'SHELL', 'LANG', 'TERM'];
    const base: NodeJS.ProcessEnv = {};
    for (const k of keep) if (process.env[k]) base[k] = process.env[k];
    return { ...base, PWD: cwd, ...(extra ?? {}) };
  }
  return { ...process.env, PWD: cwd, ...(extra ?? {}) };
}

// Streaming byte-capped collector that keeps head + tail.
class CappedBuffer {
  private head = Buffer.alloc(0);
  private tail: Buffer[] = [];
  private tailBytes = 0;
  private total = 0;
  private decoder = new StringDecoder('utf8');
  truncated = false;
  constructor(private cap: number) {}

  push(chunk: Buffer) {
    this.total += chunk.length;
    if (!this.truncated && this.head.length + chunk.length <= this.cap) {
      this.head = Buffer.concat([this.head, chunk]);
      return;
    }
    this.truncated = true;
    this.tail.push(chunk);
    this.tailBytes += chunk.length;
    const tailBudget = Math.floor(this.cap / 2);
    while (this.tailBytes > tailBudget && this.tail.length > 1) {
      this.tailBytes -= this.tail[0].length;
      this.tail.shift();
    }
  }

  toString(): string {
    if (!this.truncated) return this.decoder.write(this.head) + this.decoder.end();
    const headBudget = Math.floor(this.cap / 2);
    const headSlice = this.head.subarray(0, headBudget);
    const tailSlice = Buffer.concat(this.tail);
    const omitted = this.total - headSlice.length - tailSlice.length;
    return (
      headSlice.toString('utf8') +
      `\n...[truncated ${omitted} bytes]...\n` +
      tailSlice.toString('utf8')
    );
  }
}

function audit(cwd: string, command: string) {
  if (!AUDIT_LOG) return;
  const line = `${new Date().toISOString()}\t${cwd}\t${command.replace(/\n/g, ' ')}\n`;
  try { appendFileSync(AUDIT_LOG, line); } catch { /* never fail the command on audit error */ }
}

export async function runCommand(args: RunCommandArgs): Promise<ExecOutcome> {
  const cwd = resolveCwd(args.working_directory);

  if (!existsSync(cwd)) {
    return { status: 'error', error_code: 'cwd_not_found', error_message: `Working directory not found: ${cwd}` };
  }
  try {
    if (!statSync(cwd).isDirectory()) {
      return { status: 'error', error_code: 'cwd_not_directory', error_message: `Not a directory: ${cwd}` };
    }
  } catch (e: any) {
    return { status: 'error', error_code: 'internal', error_message: `stat failed: ${e?.message ?? e}` };
  }
  if (!withinAllowedRoots(cwd)) {
    return { status: 'error', error_code: 'cwd_forbidden', error_message: `Working directory is outside the allowed roots: ${cwd}` };
  }

  const timeoutMs = clampTimeout(args.timeout_ms ?? DEFAULT_TIMEOUT_MS);
  const shellArgs = LOGIN_SHELL ? ['-lc', args.command] : ['-c', args.command];
  audit(cwd, args.command);

  return new Promise<ExecOutcome>((resolve) => {
    const started = Date.now();
    const out = new CappedBuffer(MAX_OUTPUT_BYTES);
    const err = new CappedBuffer(MAX_OUTPUT_BYTES);
    let settled = false;
    let timedOut = false;

    let child;
    try {
      child = spawn(SHELL_PATH, shellArgs, {
        cwd,
        env: buildEnv(cwd, args.env),
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true, // become a process-group leader so we can kill grandchildren
      });
    } catch (e: any) {
      resolve({ status: 'error', error_code: 'spawn_failed', error_message: `spawn failed: ${e?.message ?? e}` });
      return;
    }

    const finish = (exitCode: number | null, signal: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const payload: RunCommandPayload = {
        command: args.command,
        working_directory: cwd,
        stdout: out.toString(),
        stderr: err.toString(),
        exit_code: exitCode,
        signal,
        duration_ms: Date.now() - started,
        timed_out: timedOut,
        truncated: out.truncated || err.truncated,
      };
      resolve({ status: 'success', data: payload });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      try { if (child.pid) process.kill(-child.pid, 'SIGKILL'); } catch { /* group may be gone */ }
    }, timeoutMs);

    child.stdout?.on('data', (c: Buffer) => out.push(c));
    child.stderr?.on('data', (c: Buffer) => err.push(c));
    child.on('error', (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ status: 'error', error_code: 'spawn_failed', error_message: `process error: ${e.message}` });
    });
    child.on('close', (code, signal) => finish(code, signal));
  });
}
