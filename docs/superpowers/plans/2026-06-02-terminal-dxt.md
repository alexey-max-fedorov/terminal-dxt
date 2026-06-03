# Terminal DXT Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Claude Desktop Extension (`.mcpb` bundle) exposing one MCP tool, `run_command`, that executes a bash command in a working directory and returns stdout, stderr, exit code, and timing.

**Architecture:** A single pure-Node MCP stdio server (no native binary). The server registers one tool, validates input with Zod, resolves the working directory (tilde/relative/allowlist), and spawns bash via `child_process.spawn` with `detached: true` so it can kill the whole process group on timeout. Output is captured into a byte-capped head+tail buffer. Exit codes are data; only failures-to-run set `isError`.

**Tech Stack:** Node 18+, TypeScript (strict, ESM, ES2022), `@modelcontextprotocol/sdk`, Zod v4, Vitest, pnpm (only — never npm/yarn), MCPB manifest v0.3.

---

## Conventions (apply to every task)

- **pnpm only.** Never `npm`, never `yarn`. Lockfile is `pnpm-lock.yaml`.
- **No em dashes** in any committed text (README, comments, error messages, manifest descriptions). Use commas, parens, or sentence breaks.
- **Stdout is sacred.** The stdio MCP transport owns the server's stdout. Never `console.log`. All diagnostics and the audit log go to stderr or a file.
- **Manifest version is `0.3`.** Do not downgrade.
- **Exit-code-as-data.** A non-zero command exit is a successful tool call.
- Commit after each task. The repo is initialized in Task 0.

---

### Task 0: Initialize repo and scaffold all config files

**Files:**
- Create: `/Users/alexey/Projects/terminal-dxt/.gitignore`
- Create: `/Users/alexey/Projects/terminal-dxt/package.json`
- Create: `/Users/alexey/Projects/terminal-dxt/tsconfig.json`
- Create: `/Users/alexey/Projects/terminal-dxt/vitest.config.ts`
- Create: `/Users/alexey/Projects/terminal-dxt/pnpm-workspace.yaml`
- Create: `/Users/alexey/Projects/terminal-dxt/.mcpbignore`
- Create: `/Users/alexey/Projects/terminal-dxt/CLAUDE.md`
- Create: `/Users/alexey/Projects/terminal-dxt/README.md` (empty placeholder, filled in Task 12)
- Create: `/Users/alexey/Projects/terminal-dxt/.github/dependabot.yml`
- Create: `/Users/alexey/Projects/terminal-dxt/.github/workflows/BetterDependabot.yml`

- [ ] **Step 1: Initialize git**

```bash
cd /Users/alexey/Projects/terminal-dxt
git init
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
node_modules.dev/
server/
*.mcpb
.DS_Store
*.log
.vscode/
.idea/
```

- [ ] **Step 3: Create `package.json`**

```json
{
  "name": "terminal-dxt",
  "version": "1.0.0",
  "type": "module",
  "main": "server/index.js",
  "scripts": {
    "build": "tsc",
    "package": "pnpm build && bash scripts/package.sh",
    "dev": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "clean": "rm -rf server/ *.mcpb"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.29.0",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@types/node": "^25.9.1",
    "tsx": "^4.22.4",
    "typescript": "^6.0.3",
    "vitest": "^4.1.7"
  },
  "engines": { "node": ">=18", "pnpm": ">=11" },
  "packageManager": "pnpm@11.3.0"
}
```

- [ ] **Step 4: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "node",
    "ignoreDeprecations": "6.0",
    "outDir": "./server",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": false,
    "sourceMap": false,
    "resolveJsonModule": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "server", "src/__tests__"]
}
```

- [ ] **Step 5: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
  },
});
```

- [ ] **Step 6: Create `pnpm-workspace.yaml`**

```yaml
allowBuilds:
  esbuild: true
```

- [ ] **Step 7: Create `.mcpbignore`**

```
src/
node_modules/.cache/
node_modules.dev/
*.log
.DS_Store
.git/
.github/
.vscode/
.idea/
tsconfig.json
vitest.config.ts
pnpm-lock.yaml
docs/
*.mcpb
terminal-dxt-prd.md
```

- [ ] **Step 8: Create `CLAUDE.md`**

```
## Version Bump
`./bump-version.sh <version>` syncs the version across `package.json` and `manifest.json`.
```

- [ ] **Step 9: Create empty `README.md`**

```
# Terminal DXT
```

- [ ] **Step 10: Create `.github/dependabot.yml`**

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: daily
    assignees:
      - alexey-max-fedorov
    commit-message:
      prefix: '[root]'

  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: daily
    assignees:
      - alexey-max-fedorov
    commit-message:
      prefix: '[github-actions]'
```

- [ ] **Step 11: Create `.github/workflows/BetterDependabot.yml`**

```yaml
name: BetterDependabot

on:
  schedule:
    - cron: '0 0 * * *'
  workflow_dispatch:

jobs:
  update-dependencies:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v6

      - uses: actions/setup-node@v6
        with:
          node-version: '20.x'

      - uses: pnpm/action-setup@v6

      - name: Update dependencies in root
        working-directory: .
        run: pnpm update

      - name: Commit changes
        run: |
          git config user.name 'github-actions[bot]'
          git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
          git add -A
          git commit -m 'chore(deps): pnpm update [root]' || echo "No changes"

      - uses: ad-m/github-push-action@master
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 12: Install dependencies with pnpm**

Run: `cd /Users/alexey/Projects/terminal-dxt && pnpm install`
Expected: Creates `node_modules/` and `pnpm-lock.yaml`. No errors.

- [ ] **Step 13: Verify pnpm is the only lockfile**

Run: `cd /Users/alexey/Projects/terminal-dxt && ls | grep lock`
Expected: shows only `pnpm-lock.yaml`. No `package-lock.json`, no `yarn.lock`.

- [ ] **Step 14: Commit**

```bash
cd /Users/alexey/Projects/terminal-dxt
git add -A
git commit -m "chore: scaffold project config and tooling"
```

---

### Task 1: Shared types

**Files:**
- Create: `/Users/alexey/Projects/terminal-dxt/src/types.ts`

- [ ] **Step 1: Create `src/types.ts`**

```typescript
export type ExecErrorCode =
  | 'invalid_input'
  | 'cwd_not_found'
  | 'cwd_not_directory'
  | 'cwd_forbidden'
  | 'spawn_failed'
  | 'internal';

export interface RunCommandPayload {
  command: string;
  working_directory: string;
  stdout: string;
  stderr: string;
  exit_code: number | null;
  signal: string | null;
  duration_ms: number;
  timed_out: boolean;
  truncated: boolean;
}

export type ExecOutcome =
  | { status: 'success'; data: RunCommandPayload }
  | { status: 'error'; error_code: ExecErrorCode; error_message: string };
```

- [ ] **Step 2: Commit**

```bash
cd /Users/alexey/Projects/terminal-dxt
git add src/types.ts
git commit -m "feat: add shared exec types"
```

---

### Task 2: Zod schema and JSON Schema mirror

**Files:**
- Create: `/Users/alexey/Projects/terminal-dxt/src/schemas.ts`

- [ ] **Step 1: Create `src/schemas.ts`**

```typescript
import { z } from 'zod';

export const RunCommandInput = z.object({
  command: z.string().min(1, 'command is required'),
  working_directory: z.string().min(1).optional(),
  timeout_ms: z.number().int().min(100).max(600_000).optional(),
  env: z.record(z.string()).optional(),
}).strict();

export type RunCommandArgs = z.infer<typeof RunCommandInput>;

export const toolJsonSchemas = {
  run_command: {
    type: 'object',
    properties: {
      command: { type: 'string', description: "The bash command line to execute, e.g. 'pnpm install && pnpm build'." },
      working_directory: { type: 'string', description: "Optional. Directory to run in. Supports '~' expansion. Relative paths resolve against the configured default. Defaults to the configured default (home directory if unset)." },
      timeout_ms: { type: 'integer', minimum: 100, maximum: 600_000, description: 'Optional. Override the default timeout in milliseconds.' },
      env: { type: 'object', additionalProperties: { type: 'string' }, description: 'Optional. Extra environment variables merged on top of the inherited environment for this command only.' },
    },
    required: ['command'],
    additionalProperties: false,
  },
} as const;

export const toolDescriptions = {
  run_command: 'Execute a bash command in a working directory and return its stdout, stderr, and exit code.',
} as const;

export type ToolName = keyof typeof toolJsonSchemas;
```

- [ ] **Step 2: Type-check compiles**

Run: `cd /Users/alexey/Projects/terminal-dxt && pnpm build`
Expected: tsc succeeds (it will also try to compile `index.ts`/`executor.ts` which do not exist yet, so this may error on missing files; if so, that is fine — the goal is only that `schemas.ts` and `types.ts` themselves have no type errors. Re-run after Task 5 for a full clean build). If errors are ONLY about missing `./executor.js` or `./index.ts`, proceed.

- [ ] **Step 3: Commit**

```bash
cd /Users/alexey/Projects/terminal-dxt
git add src/schemas.ts
git commit -m "feat: add run_command Zod schema and JSON Schema mirror"
```

---

### Task 3: Executor tests (write failing tests first — TDD)

**Files:**
- Create: `/Users/alexey/Projects/terminal-dxt/src/__tests__/executor.test.ts`

The executor reads config from `TERMINAL_*` env vars at module load time. To vary config per test, we must reset the module registry and re-import `runCommand` after setting env. Use `vitest`'s `vi.resetModules()` plus dynamic `import()`.

- [ ] **Step 1: Write the failing test file**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
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
    require('node:fs').mkdirSync(sub);
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
});
```

- [ ] **Step 2: Run tests to confirm they fail (executor does not exist yet)**

Run: `cd /Users/alexey/Projects/terminal-dxt && pnpm test`
Expected: FAIL — cannot resolve `../executor.js`. This proves the tests run and are wired up.

- [ ] **Step 3: Commit the failing tests**

```bash
cd /Users/alexey/Projects/terminal-dxt
git add src/__tests__/executor.test.ts
git commit -m "test: add executor test matrix (failing — no implementation yet)"
```

---

### Task 4: Implement the executor

**Files:**
- Create: `/Users/alexey/Projects/terminal-dxt/src/executor.ts`
- Test: `/Users/alexey/Projects/terminal-dxt/src/__tests__/executor.test.ts` (from Task 3)

- [ ] **Step 1: Create `src/executor.ts`**

```typescript
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

const DEFAULT_CWD = (() => {
  const raw = process.env.TERMINAL_DEFAULT_CWD?.trim();
  return raw ? path.resolve(expandHome(raw)) : os.homedir();
})();

const ALLOWED_ROOTS = (process.env.TERMINAL_ALLOWED_ROOTS || '')
  .split(':')
  .map((s) => s.trim())
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

function buildEnv(extra?: Record<string, string>): NodeJS.ProcessEnv {
  if (ENV_MODE === 'minimal') {
    const keep = ['PATH', 'HOME', 'USER', 'SHELL', 'LANG', 'TERM'];
    const base: NodeJS.ProcessEnv = {};
    for (const k of keep) if (process.env[k]) base[k] = process.env[k];
    return { ...base, ...(extra ?? {}) };
  }
  return { ...process.env, ...(extra ?? {}) };
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
        env: buildEnv(args.env),
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
```

- [ ] **Step 2: Run the full executor test matrix**

Run: `cd /Users/alexey/Projects/terminal-dxt && pnpm test`
Expected: All tests in `executor.test.ts` PASS. If the "relative cwd" test fails on a `require` ESM issue, note that the test uses `require('node:fs')` inside an ESM file; if that errors, change that one line in the test to `import('node:fs')`-style or add `import { mkdirSync } from 'node:fs'` at the top of the test and call `mkdirSync(sub)`. Make the test green without weakening assertions.

- [ ] **Step 3: Commit**

```bash
cd /Users/alexey/Projects/terminal-dxt
git add src/executor.ts src/__tests__/executor.test.ts
git commit -m "feat: implement executor (spawn, cwd resolution, timeout group-kill, output cap)"
```

---

### Task 5: Implement the MCP server entry

**Files:**
- Create: `/Users/alexey/Projects/terminal-dxt/src/index.ts`

- [ ] **Step 1: Create `src/index.ts`**

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { RunCommandInput, toolJsonSchemas, toolDescriptions } from './schemas.js';
import { runCommand } from './executor.js';
import type { ExecOutcome } from './types.js';

function outcomeToMcp(outcome: ExecOutcome) {
  if (outcome.status === 'success') {
    return { content: [{ type: 'text' as const, text: JSON.stringify(outcome.data) }] };
  }
  return { content: [{ type: 'text' as const, text: outcome.error_message }], isError: true as const };
}

async function main() {
  const server = new Server({ name: 'terminal-dxt', version: '1.0.0' }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [{
      name: 'run_command',
      description: toolDescriptions.run_command,
      inputSchema: toolJsonSchemas.run_command,
    }],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    if (req.params.name !== 'run_command') {
      return { content: [{ type: 'text' as const, text: `Unknown tool: ${String(req.params.name)}` }], isError: true as const };
    }
    const parsed = RunCommandInput.safeParse(req.params.arguments ?? {});
    if (!parsed.success) {
      return { content: [{ type: 'text' as const, text: `Invalid arguments: ${parsed.error.message}` }], isError: true as const };
    }
    const outcome = await runCommand(parsed.data);
    return outcomeToMcp(outcome);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`terminal-dxt server crashed: ${err?.stack ?? err}\n`);
  process.exit(1);
});
```

- [ ] **Step 2: Full clean build**

Run: `cd /Users/alexey/Projects/terminal-dxt && pnpm build`
Expected: tsc succeeds, produces `server/index.js`, `server/executor.js`, `server/schemas.js`, `server/types.js`. No type errors.

- [ ] **Step 3: Re-run the test suite (ensure nothing regressed)**

Run: `cd /Users/alexey/Projects/terminal-dxt && pnpm test`
Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
cd /Users/alexey/Projects/terminal-dxt
git add src/index.ts
git commit -m "feat: implement MCP stdio server with run_command tool"
```

---

### Task 6: Smoke-test the server over JSON-RPC

**Files:**
- (no new files; verification only)

- [ ] **Step 1: Hand-roll a `tools/call` against the built server**

Run this from the project root. It pipes two JSON-RPC messages (initialize + tools/call) into the server and prints the responses:

```bash
cd /Users/alexey/Projects/terminal-dxt
TERMINAL_DEFAULT_CWD="$HOME" node - <<'EOF'
import { spawn } from 'node:child_process';
const srv = spawn('node', ['server/index.js'], { env: { ...process.env, TERMINAL_DEFAULT_CWD: process.env.HOME }, stdio: ['pipe','pipe','inherit'] });
let buf = '';
srv.stdout.on('data', d => {
  buf += d.toString();
  for (const line of buf.split('\n')) {
    if (!line.trim()) continue;
    try { const msg = JSON.parse(line); console.error('RESP', JSON.stringify(msg)); } catch {}
  }
});
const send = (o) => srv.stdin.write(JSON.stringify(o) + '\n');
send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '0' } } });
setTimeout(() => send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'run_command', arguments: { command: 'echo Whatsup' } } }), 300);
setTimeout(() => { srv.kill(); process.exit(0); }, 1500);
EOF
```

Expected: Among the printed `RESP` lines, one contains the tool result with `"stdout":"Whatsup\n"` and `"exit_code":0`. (Note: passing the script via stdin with ESM imports requires Node to treat it as a module; if Node complains, save the snippet to `smoke.mjs`, run `node smoke.mjs`, then delete it. Either way confirm the `Whatsup` round trip.)

- [ ] **Step 2: No commit needed (verification step). Proceed.**

---

### Task 7: Manifest

**Files:**
- Create: `/Users/alexey/Projects/terminal-dxt/manifest.json`

- [ ] **Step 1: Create `manifest.json`**

```json
{
  "manifest_version": "0.3",
  "name": "terminal-dxt",
  "display_name": "Terminal",
  "version": "1.0.0",
  "description": "Run a bash command in a working directory and get back stdout, stderr, and exit code. Local only, no credentials.",
  "long_description": "Terminal DXT gives Claude a single tool to execute bash commands on your Mac. Pass a command and an optional working directory; the extension runs it in a login shell, captures stdout and stderr, enforces a timeout, and returns the result. It runs entirely on your machine with your own user privileges. No network calls by the extension itself, no credentials, no telemetry.",
  "author": {
    "name": "Alexey Fedorov",
    "email": "alexey.max.fedorov@gmail.com",
    "url": "https://github.com/alexey-max-fedorov"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/alexey-max-fedorov/terminal-dxt"
  },
  "homepage": "https://github.com/alexey-max-fedorov/terminal-dxt",
  "documentation": "https://github.com/alexey-max-fedorov/terminal-dxt#readme",
  "support": "https://github.com/alexey-max-fedorov/terminal-dxt/issues",
  "icon": "icon.png",
  "keywords": ["terminal", "bash", "shell", "command", "exec", "macos", "developer"],
  "license": "LicenseRef-Terminal-DXT",
  "server": {
    "type": "node",
    "entry_point": "server/index.js",
    "mcp_config": {
      "command": "node",
      "args": ["${__dirname}/server/index.js"],
      "env": {
        "TERMINAL_DEFAULT_CWD": "${user_config.default_working_directory}",
        "TERMINAL_ALLOWED_ROOTS": "${user_config.allowed_roots}",
        "TERMINAL_DEFAULT_TIMEOUT_MS": "${user_config.default_timeout_ms}",
        "TERMINAL_MAX_OUTPUT_BYTES": "${user_config.max_output_bytes}",
        "TERMINAL_SHELL_PATH": "${user_config.shell_path}",
        "TERMINAL_LOGIN_SHELL": "${user_config.login_shell}",
        "TERMINAL_ENV_MODE": "${user_config.env_mode}",
        "TERMINAL_AUDIT_LOG": "${user_config.audit_log_path}"
      }
    }
  },
  "user_config": {
    "default_working_directory": {
      "type": "directory",
      "title": "Default working directory",
      "description": "Used when a call does not specify working_directory. Defaults to your home directory.",
      "required": false,
      "default": "${HOME}"
    },
    "allowed_roots": {
      "type": "string",
      "title": "Allowed roots (colon-separated)",
      "description": "Optional. If set, commands may only run inside these directory trees. Empty means unrestricted. Example: /Users/you/Projects:/Users/you/Sites",
      "required": false,
      "default": ""
    },
    "default_timeout_ms": {
      "type": "number",
      "title": "Default timeout (ms)",
      "description": "How long a command may run before it is killed. Clamped to 100..600000.",
      "required": false,
      "default": 120000
    },
    "max_output_bytes": {
      "type": "number",
      "title": "Max captured output (bytes)",
      "description": "Per-stream cap on captured stdout/stderr. Output beyond this is truncated (head + tail kept).",
      "required": false,
      "default": 1048576
    },
    "shell_path": {
      "type": "string",
      "title": "Shell path",
      "description": "Shell used to run commands. Default /bin/bash. Set to a Homebrew bash or zsh if you prefer.",
      "required": false,
      "default": "/bin/bash"
    },
    "login_shell": {
      "type": "boolean",
      "title": "Use login shell",
      "description": "Run as a login shell (bash -lc) so PATH and dev tooling load. Turn off for faster, cleaner startup.",
      "required": false,
      "default": true
    },
    "env_mode": {
      "type": "string",
      "title": "Environment mode",
      "description": "full = pass the whole Claude Desktop environment to commands. minimal = pass only PATH, HOME, USER, SHELL, LANG, TERM.",
      "required": false,
      "default": "full"
    },
    "audit_log_path": {
      "type": "string",
      "title": "Audit log path",
      "description": "Optional. If set, every command (timestamp, cwd, command) is appended to this file. Never written to stdout.",
      "required": false,
      "default": ""
    }
  },
  "tools": [
    {
      "name": "run_command",
      "description": "Execute a bash command in a working directory and return its stdout, stderr, and exit code."
    }
  ],
  "compatibility": {
    "claude_desktop": ">=1.0.0",
    "platforms": ["darwin"],
    "runtimes": {
      "node": ">=18.0.0"
    }
  }
}
```

- [ ] **Step 2: Validate JSON parses**

Run: `cd /Users/alexey/Projects/terminal-dxt && node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest OK')"`
Expected: prints `manifest OK`.

- [ ] **Step 3: Commit**

```bash
cd /Users/alexey/Projects/terminal-dxt
git add manifest.json
git commit -m "feat: add MCPB v0.3 manifest with user_config"
```

---

### Task 8: Build scripts (package.sh + bump-version.sh)

**Files:**
- Create: `/Users/alexey/Projects/terminal-dxt/scripts/package.sh`
- Create: `/Users/alexey/Projects/terminal-dxt/bump-version.sh`

- [ ] **Step 1: Create `scripts/package.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Cleaning previous .mcpb"
rm -f ./*.mcpb

echo "==> Backing up dev node_modules"
if [ -d node_modules ]; then
  rm -rf node_modules.dev
  mv node_modules node_modules.dev
fi

restore_dev_modules() {
  if [ -d node_modules.dev ]; then
    rm -rf node_modules
    mv node_modules.dev node_modules
  fi
}
trap restore_dev_modules EXIT

echo "==> Installing prod-only flat node_modules (hoisted linker)"
pnpm install --prod --shamefully-hoist --no-frozen-lockfile

echo "==> Packing .mcpb via @anthropic-ai/mcpb"
npx -y @anthropic-ai/mcpb pack

# mcpb names the output after the working directory; normalize it.
TARGET_NAME="terminal-dxt.mcpb"
PACKED=$(ls -1 ./*.mcpb | head -1)
if [ -n "$PACKED" ] && [ "$PACKED" != "./$TARGET_NAME" ]; then
  mv "$PACKED" "./$TARGET_NAME"
fi

echo "==> .mcpb produced:"
ls -1 ./*.mcpb
```

- [ ] **Step 2: Create `bump-version.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

NEW_VERSION="${1:-}"
if [ -z "$NEW_VERSION" ]; then
  echo "Usage: ./bump-version.sh <new-version>"
  echo "Example: ./bump-version.sh 1.1.0"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")" && pwd)"

# Update package.json
node -e "
  const fs = require('fs');
  const p = '$ROOT/package.json';
  const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
  pkg.version = '$NEW_VERSION';
  fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + '\n');
"

# Update manifest.json
node -e "
  const fs = require('fs');
  const p = '$ROOT/manifest.json';
  const manifest = JSON.parse(fs.readFileSync(p, 'utf8'));
  manifest.version = '$NEW_VERSION';
  fs.writeFileSync(p, JSON.stringify(manifest, null, 2) + '\n');
"

echo "Bumped to v$NEW_VERSION (package.json + manifest.json)"
```

- [ ] **Step 3: Make both scripts executable**

Run: `cd /Users/alexey/Projects/terminal-dxt && chmod +x scripts/package.sh bump-version.sh`
Expected: no output, exit 0.

- [ ] **Step 4: Commit**

```bash
cd /Users/alexey/Projects/terminal-dxt
git add scripts/package.sh bump-version.sh
git commit -m "build: add package.sh and bump-version.sh"
```

---

### Task 9: LICENSE and PRIVACY

**Files:**
- Create: `/Users/alexey/Projects/terminal-dxt/LICENSE`
- Create: `/Users/alexey/Projects/terminal-dxt/PRIVACY.md`

- [ ] **Step 1: Create `LICENSE`**

```
Copyright (c) 2026 Alexey Fedorov. All rights reserved.

This software is made available for noncommercial use only, under the
Terminal DXT License reproduced below. For any commercial use, please
contact alexey.max.fedorov@gmail.com to obtain a separate license.

================================================================================

# Terminal DXT License

## Acceptance

In order to get any license under these terms, you must agree
to them as both strict obligations and conditions to all
your licenses.

## Copyright License

The licensor grants you a copyright license for the
software to do everything you might do with the software
that would otherwise infringe the licensor's copyright
in it for any permitted purpose.  However, you may
only distribute the software according to [Distribution
License](#distribution-license) and make changes or new works
based on the software according to [Changes and New Works
License](#changes-and-new-works-license).

## Distribution License

The licensor grants you an additional copyright license
to distribute copies of the software.  Your license
to distribute covers distributing the software with
changes and new works permitted by [Changes and New Works
License](#changes-and-new-works-license).

## Notices

You must ensure that anyone who gets a copy of any part of
the software from you also gets a copy of these terms or the
URL for them above, as well as copies of any plain-text lines
beginning with `Required Notice:` that the licensor provided
with the software.  For example:

> Required Notice: Copyright (c) 2026 Alexey Fedorov

## Changes and New Works License

The licensor grants you an additional copyright license to
make changes and new works based on the software for any
permitted purpose.

## Patent License

The licensor grants you a patent license for the software that
covers patent claims the licensor can license, or becomes able
to license, that you would infringe by using the software.

## Noncommercial Purposes

Any noncommercial purpose is a permitted purpose.

## Personal Uses

Personal use for research, experiment, and testing for
the benefit of public knowledge, personal study, private
entertainment, hobby projects, amateur pursuits, or religious
observance, without any anticipated commercial application,
is use for a permitted purpose.

## Noncommercial Organizations

Use by any charitable organization, educational institution,
public research organization, public safety or health
organization, environmental protection organization, is
use for a permitted purpose regardless of the source of funding
or obligations resulting from the funding.

## Fair Use

You may have "fair use" rights for the software under the
law.  These terms do not limit them.

## No Other Rights

These terms do not allow you to sublicense or transfer any of
your licenses to anyone else, or prevent the licensor from
granting licenses to anyone else.  These terms do not imply
any other licenses.

## Prohibited Uses

Notwithstanding any permitted purpose under these terms, you
may not use the software, in whole or in part, for:

1. **Autonomous surveillance**: any system that monitors,
tracks, or identifies individuals in an automated or
semi-automated manner without their knowledge and ongoing
consent.

2. **Autonomous weapons**: any system designed to select and
engage targets with lethal or non-lethal force without
meaningful human control over each individual targeting
decision.

Use of the software for either purpose immediately and
permanently terminates all licenses granted to you under
these terms.

## Patent Defense

If you make any written claim that the software infringes or
contributes to infringement of any patent, your patent license
for the software granted under these terms ends immediately. If
your company makes such a claim, your patent license ends
immediately for work on behalf of your company.

## Violations

The first time you are notified in writing that you have
violated any of these terms, or done anything with the software
not covered by your licenses, your licenses can nonetheless
continue if you come into full compliance with these terms,
and take practical steps to correct past violations, within
32 days of receiving notice.  Otherwise, all your licenses
end immediately.

## No Liability

***As far as the law allows, the software comes as is, without
any warranty or condition, and the licensor will not be liable
to you for any damages arising out of these terms or the use
or nature of the software, under any kind of legal claim.***

## Definitions

The **licensor** is the individual or entity offering these
terms, and the **software** is the software the licensor makes
available under these terms.

**You** refers to the individual or entity agreeing to these
terms.

**Your company** is any legal entity, sole proprietorship,
or other kind of organization that you work for, plus all
organizations that have control over, are under the control of,
or are under common control with that organization.  **Control**
means ownership of substantially all the assets of an entity,
or the power to direct its management and policies by vote,
contract, or otherwise.  Control can be direct or indirect.

**Your licenses** are all the licenses granted to you for the
software under these terms.

**Use** means anything you do with the software requiring one
of your licenses.
```

- [ ] **Step 2: Create `PRIVACY.md`**

```
# Privacy Policy

Terminal DXT runs entirely on your local machine.

## Data handling

- The extension makes no network calls of its own. (Commands you run can, of course, do anything.)
- No telemetry, analytics, or crash reports are sent.
- Commands run with your user account's privileges via a local shell.
- If you enable the audit log, command text, working directory, and timestamps are appended to the
  local file you specify. That file never leaves your machine and is never written to stdout.
- The extension stores no credentials.

## Contact

Questions or concerns: alexey.max.fedorov@gmail.com
```

- [ ] **Step 3: Commit**

```bash
cd /Users/alexey/Projects/terminal-dxt
git add LICENSE PRIVACY.md
git commit -m "docs: add LICENSE and PRIVACY"
```

---

### Task 10: Icon

**Files:**
- Create: `/Users/alexey/Projects/terminal-dxt/icon.png` (256x256)

- [ ] **Step 1: Generate a 256x256 PNG icon**

The manifest references `icon.png`. Generate a simple 256x256 placeholder PNG (a dark terminal-style square with a prompt glyph) so the bundle packs. Use a one-shot Node script with no external deps that writes a valid PNG. Run:

```bash
cd /Users/alexey/Projects/terminal-dxt
node - <<'EOF'
// Minimal 256x256 solid-color PNG writer (no deps), dark slate background.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const W = 256, H = 256;
const bg = [24, 24, 27];      // zinc-900
// raw image data: each row prefixed with filter byte 0
const raw = Buffer.alloc((W * 3 + 1) * H);
let o = 0;
for (let y = 0; y < H; y++) {
  raw[o++] = 0;
  for (let x = 0; x < W; x++) {
    // draw a simple ">" prompt in a lighter color near the left-center
    const inGlyph =
      (x > 60 && x < 110 && Math.abs((y - 128)) < (x - 60) && Math.abs(y - 128) < 50) ||
      (x >= 110 && x < 160 && Math.abs((y - 128)) < (160 - x) && Math.abs(y - 128) < 50);
    const px = inGlyph ? [110, 231, 183] : bg; // emerald glyph
    raw[o++] = px[0]; raw[o++] = px[1]; raw[o++] = px[2];
  }
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4);
  // CRC32
  let c = ~0;
  for (const b of body) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  crc.writeUInt32BE((~c) >>> 0, 0);
  return Buffer.concat([len, body, crc]);
}
const sig = Buffer.from([137,80,78,71,13,10,26,10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W,0); ihdr.writeUInt32BE(H,4);
ihdr[8]=8; ihdr[9]=2; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0; // 8-bit, truecolor
const idat = deflateSync(raw);
const png = Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
writeFileSync('icon.png', png);
console.log('wrote icon.png', png.length, 'bytes');
EOF
```

Expected: prints `wrote icon.png <N> bytes`. Verify it is a valid PNG:

Run: `cd /Users/alexey/Projects/terminal-dxt && file icon.png`
Expected: output contains `PNG image data, 256 x 256`.

- [ ] **Step 2: Commit**

```bash
cd /Users/alexey/Projects/terminal-dxt
git add icon.png
git commit -m "assets: add 256x256 extension icon"
```

---

### Task 11: Package the bundle and verify contents

**Files:**
- (produces `/Users/alexey/Projects/terminal-dxt/terminal-dxt.mcpb`)

- [ ] **Step 1: Run the packager**

Run: `cd /Users/alexey/Projects/terminal-dxt && pnpm package`
Expected: builds, installs prod-flat node_modules, packs, prints `terminal-dxt.mcpb`. The dev `node_modules` is restored on exit (the trap in package.sh). If `npx @anthropic-ai/mcpb` cannot be fetched offline, report the exact error rather than faking success.

- [ ] **Step 2: Inspect the archive contents**

Run: `cd /Users/alexey/Projects/terminal-dxt && unzip -l terminal-dxt.mcpb | head -40`
Expected: archive includes `manifest.json`, `server/index.js` (and the other compiled files), `node_modules/`, `icon.png`. It must NOT include `src/`. Confirm `src/` is absent.

- [ ] **Step 3: Confirm dev node_modules restored and tests still pass**

Run: `cd /Users/alexey/Projects/terminal-dxt && pnpm test`
Expected: all tests PASS (proves dev deps like vitest were restored).

- [ ] **Step 4: Commit (the .mcpb is gitignored, so this commits nothing new unless package-lock churn; safe to skip if nothing to commit)**

```bash
cd /Users/alexey/Projects/terminal-dxt
git add -A
git commit -m "build: produce terminal-dxt.mcpb" || echo "nothing to commit"
```

---

### Task 12: README

**Files:**
- Modify: `/Users/alexey/Projects/terminal-dxt/README.md`

- [ ] **Step 1: Write the full README**

Replace the placeholder `README.md` with the following. (No em dashes anywhere.)

```markdown
# Terminal DXT

A Claude Desktop Extension that gives Claude one tool, `run_command`, to execute a bash command in a
working directory on your Mac and return stdout, stderr, exit code, and timing. It runs entirely on
your machine with your own user privileges. The extension makes no network calls of its own, ships
no credentials, and sends no telemetry.

## Install

1. Open Claude Desktop, go to Settings, Extensions, Advanced settings, Extension Developer.
2. Click "Install Extension..." and select `terminal-dxt.mcpb`.
3. Fill in the user config in the install UI (see below).
4. The `run_command` tool appears in your next chat. There is no permission prompt; commands run
   immediately.

## User config

| Setting | Default | What it does |
|---|---|---|
| Default working directory | your home dir | Used when a call omits `working_directory`. |
| Allowed roots (colon-separated) | empty (unrestricted) | If set, commands may only run inside these trees. |
| Default timeout (ms) | 120000 | How long a command may run before it is killed. Clamped 100..600000. |
| Max captured output (bytes) | 1048576 | Per-stream cap. Output beyond this is truncated (head plus tail kept). |
| Shell path | /bin/bash | Shell used to run commands. Point at a Homebrew bash/zsh if you prefer. |
| Use login shell | on | Run as `bash -lc` so PATH and dev tooling load. |
| Environment mode | full | `full` passes the whole environment; `minimal` passes only PATH, HOME, USER, SHELL, LANG, TERM. |
| Audit log path | empty (off) | If set, every command (timestamp, cwd, command) is appended to this file. Never written to stdout. |

## The tool

`run_command` takes:

- `command` (required): the bash command line, e.g. `pnpm install && pnpm build`.
- `working_directory` (optional): supports `~` expansion; relative paths resolve against the
  configured default.
- `timeout_ms` (optional): override the default, clamped 100..600000.
- `env` (optional): extra environment variables merged on top of the inherited environment for that
  call only.

It returns JSON with `stdout`, `stderr`, `exit_code`, `signal`, `duration_ms`, `timed_out`,
`truncated`, and the resolved `working_directory`. A non-zero exit code is normal data, not a tool
error. Tool errors are reserved for cases where the command could not be run as requested (bad cwd,
forbidden cwd, spawn failure).

## Security

This tool is, by design, arbitrary local code execution driven by a language model. The real risk is
prompt injection: untrusted content Claude reads (a web page, a file, a tool result) that tells it to
run a harmful command. If Claude follows that instruction, this tool turns prompt injection into code
execution on your machine. That is the whole risk surface.

What the extension does to bound that:

- Optional `allowed_roots` directory confinement (a real, enforced boundary on where a command
  starts).
- A timeout that kills the whole process group, and per-stream output caps.
- `env_mode = minimal` to reduce what secrets sit in the child environment.
- An optional local audit log.

What it deliberately does not do: command denylists or "dangerous pattern" blocking. String matching
is trivially bypassed and gives false confidence. The honest boundary is: do not install this if you
do not trust both the model and the contexts you run it in. For a hard boundary, run with
`allowed_roots` set, turn on the audit log, and consider a dedicated least-privilege macOS user
account.

See `PRIVACY.md` for data handling and `LICENSE` for terms.

## Troubleshooting

- **A command hangs until timeout.** stdin is closed, so interactive commands (editors, pagers,
  `sudo` password prompts, REPLs) block forever. Use non-interactive flags (`--yes`, `--no-pager`,
  `-y`). `sudo` is effectively unusable, by design.
- **"command not found" for a tool you have.** Login shell may be off, or `shell_path` points
  somewhere without your PATH. Turn login shell on, or fix `shell_path`.
- **Output looks cut with a `...[truncated N bytes]...` marker.** The stream exceeded
  `max_output_bytes`. Raise the cap or narrow the command's output.

## Development

```bash
pnpm install   # dev deps
pnpm build     # tsc -> server/
pnpm test      # vitest
pnpm package   # build + pack -> terminal-dxt.mcpb
```

Bump the version across `package.json` and `manifest.json` with `./bump-version.sh <version>`.
```

- [ ] **Step 2: Commit**

```bash
cd /Users/alexey/Projects/terminal-dxt
git add README.md
git commit -m "docs: write README (install, config, security, troubleshooting)"
```

---

### Task 13: Final clean build and tag

**Files:**
- (no new files; release verification)

- [ ] **Step 1: Full clean rebuild from scratch**

Run: `cd /Users/alexey/Projects/terminal-dxt && pnpm clean && pnpm install && pnpm test && pnpm package`
Expected: clean removes `server/` and `*.mcpb`; install succeeds; all tests PASS; package produces `terminal-dxt.mcpb`. Report the final `ls -1 ./*.mcpb` output.

- [ ] **Step 2: Confirm no em dashes in committed prose**

Run: `cd /Users/alexey/Projects/terminal-dxt && grep -rn "—" README.md PRIVACY.md manifest.json src/ 2>/dev/null | grep -v node_modules || echo "no em dashes found"`
Expected: prints `no em dashes found`. If any are found, replace them with commas/parens/sentence breaks and re-commit.

- [ ] **Step 3: Tag the release**

```bash
cd /Users/alexey/Projects/terminal-dxt
git tag v1.0.0
git log --oneline | head -20
```

Expected: tag created; commit history shows the task progression.

- [ ] **Step 4: Final commit if anything is dirty**

```bash
cd /Users/alexey/Projects/terminal-dxt
git add -A
git commit -m "chore: finalize v1.0.0" || echo "nothing to commit"
```

---

## Self-Review notes (coverage against the PRD)

- Section 4 manifest + `.mcpbignore`: Tasks 7, 0. ✅
- Section 5 tool spec (input schema, success/error payloads, error taxonomy, cwd resolution, shell, env, stdin closed, output cap, group kill, stdout sacred): Tasks 2, 4, 5. ✅
- Section 6 sources (types, schemas, executor, index, package.json, tsconfig, vitest config): Tasks 0, 1, 2, 4, 5. ✅
- Section 9 LICENSE + PRIVACY: Task 9. ✅
- Section 10 build/package + bump-version: Tasks 8, 11, 13. ✅
- Section 11 test matrix: Task 3 (every row represented). ✅
- Appendix A (.gitignore, pnpm-workspace.yaml, CLAUDE.md, dependabot, BetterDependabot): Task 0. ✅
- Section 12 implementation order: tasks follow Phase 0 -> 6 ordering. ✅
- Constraints (pnpm only, no em dashes, stdout sacred, manifest 0.3, exit-code-as-data): folded into Conventions and individual steps. ✅

Manual-in-Claude-Desktop matrix (Section 11) is documented but cannot be automated here; it is covered by README troubleshooting and the JSON-RPC smoke test in Task 6.
```
