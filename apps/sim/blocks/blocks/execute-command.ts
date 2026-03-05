import { TerminalIcon } from '@/components/icons'
import { isTruthy } from '@/lib/core/config/env'
import { DEFAULT_EXECUTION_TIMEOUT_MS } from '@/lib/execution/constants'
import type { BlockConfig } from '@/blocks/types'
import type { ExecuteCommandOutput } from '@/tools/execute-command/types'

export const ExecuteCommandBlock: BlockConfig<ExecuteCommandOutput> = {
  type: 'execute_command',
  name: 'Execute Command',
  description: 'Run shell commands',
  hideFromToolbar: !isTruthy(process.env.NEXT_PUBLIC_EXECUTE_COMMAND_ENABLED),
  longDescription:
    'Execute shell commands on the host machine. Only available for self-hosted deployments with EXECUTE_COMMAND_ENABLED=true. Commands run in the default shell of the host OS.',
  bestPractices: `
  - Commands execute in the default shell of the host machine (bash, zsh, cmd, PowerShell).
  - Chain multiple commands with && to run them sequentially.
  - Use <blockName.output> syntax to reference outputs from other blocks.
  - Use {{ENV_VAR}} syntax to reference environment variables.
  - The working directory defaults to the server process directory if not specified. Variable references are not supported in the Working Directory field — use a literal path.
  - A non-zero exit code is returned as data (exitCode > 0), not treated as a workflow error. Use a Condition block to branch on exitCode if needed.
  - Variable values from other blocks are interpolated directly into the command string. Avoid passing untrusted user input as block references to prevent shell injection.
  `,
  docsLink: 'https://docs.sim.ai/blocks/execute-command',
  category: 'blocks',
  bgColor: '#1E1E1E',
  icon: TerminalIcon,
  subBlocks: [
    {
      id: 'command',
      title: 'Command',
      type: 'long-input',
      required: true,
      placeholder: 'echo "Hello, World!"',
      wandConfig: {
        enabled: true,
        prompt: `You are an expert shell scripting assistant.
Generate ONLY the raw shell command(s) based on the user's request. Never wrap in markdown formatting.
The command runs in the default shell of the host OS (bash, zsh, cmd, or PowerShell).

- Reference outputs from previous blocks using angle bracket syntax: <blockName.output>
- Reference environment variables using double curly brace syntax: {{ENV_VAR_NAME}}
- Chain multiple commands with && to run them sequentially.
- Use pipes (|) to chain command output.

Current command context: {context}

IMPORTANT FORMATTING RULES:
1. Output ONLY the shell command(s). No explanations, no markdown, no comments.
2. Use <blockName.field> to reference block outputs. Do NOT wrap in quotes.
3. Use {{VAR_NAME}} to reference environment variables. Do NOT wrap in quotes.
4. Write portable commands when possible (prefer POSIX-compatible syntax).
5. For multi-step operations, chain with && or use subshells.`,
        placeholder: 'Describe the command you want to run...',
      },
    },
    {
      id: 'workingDirectory',
      title: 'Working Directory',
      type: 'short-input',
      required: false,
      placeholder: '/path/to/directory',
    },
    {
      id: 'timeout',
      title: 'Timeout (ms)',
      type: 'short-input',
      required: false,
      placeholder: String(DEFAULT_EXECUTION_TIMEOUT_MS),
    },
  ],
  tools: {
    access: ['execute_command_run'],
  },
  inputs: {
    command: { type: 'string', description: 'Shell command to execute' },
    workingDirectory: { type: 'string', description: 'Working directory for the command' },
    timeout: { type: 'number', description: 'Execution timeout in milliseconds' },
  },
  outputs: {
    stdout: { type: 'string', description: 'Standard output from the command' },
    stderr: { type: 'string', description: 'Standard error output from the command' },
    exitCode: { type: 'number', description: 'Exit code of the command (0 = success)' },
    error: {
      type: 'string',
      description: 'Error message if the command timed out or exceeded buffer limits',
    },
  },
}
