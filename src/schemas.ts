import { z } from 'zod';

export const RunCommandInput = z.object({
  command: z.string().min(1, 'command is required'),
  working_directory: z.string().min(1).optional(),
  timeout_ms: z.number().int().min(100).max(600_000).optional(),
  env: z.record(z.string(), z.string()).optional(),
}).strict();

export type RunCommandArgs = z.infer<typeof RunCommandInput>;

export const toolJsonSchemas = {
  run_command: {
    type: 'object',
    properties: {
      command: { type: 'string', description: "The zsh command line to execute, e.g. 'pnpm install && pnpm build'." },
      working_directory: { type: 'string', description: "Optional. Directory to run in. Supports '~' expansion. Relative paths resolve against the configured default. Defaults to the configured default (home directory if unset)." },
      timeout_ms: { type: 'integer', minimum: 100, maximum: 600_000, description: 'Optional. Override the default timeout in milliseconds.' },
      env: { type: 'object', additionalProperties: { type: 'string' }, description: 'Optional. Extra environment variables merged on top of the inherited environment for this command only.' },
    },
    required: ['command'],
    additionalProperties: false,
  },
} as const;

export const toolDescriptions = {
  run_command: 'Execute a zsh command in a working directory and return its stdout, stderr, and exit code.',
} as const;

export type ToolName = keyof typeof toolJsonSchemas;
