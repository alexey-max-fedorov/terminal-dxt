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
  const server = new Server({ name: 'terminal-dxt', version: '1.0.1' }, { capabilities: { tools: {} } });

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
