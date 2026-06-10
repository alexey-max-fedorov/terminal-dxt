# Terminal DXT

A Claude Desktop Extension that gives Claude one tool, `run_command`, to execute a zsh command in a
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
| Shell path | /bin/zsh | Shell used to run commands. Point at a Homebrew zsh/bash if you prefer. |
| Use login shell | on | Run as `zsh -lc` so PATH and dev tooling load. |
| Environment mode | full | `full` passes the whole environment; `minimal` passes only PATH, HOME, USER, SHELL, LANG, TERM. |
| Audit log path | empty (off) | If set, every command (timestamp, cwd, command) is appended to this file. Never written to stdout. |

## The tool

`run_command` takes:

- `command` (required): the zsh command line, e.g. `pnpm install && pnpm build`.
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
