export type { RunCommandArgs } from './schemas.js';

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
