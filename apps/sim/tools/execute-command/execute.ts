import { DEFAULT_EXECUTION_TIMEOUT_MS } from '@/lib/execution/constants'
import type { ExecuteCommandInput, ExecuteCommandOutput } from '@/tools/execute-command/types'
import type { ToolConfig } from '@/tools/types'

export const executeCommandRunTool: ToolConfig<ExecuteCommandInput, ExecuteCommandOutput> = {
  id: 'execute_command_run',
  name: 'Execute Command',
  description:
    'Execute a shell command on the host machine. Only available for self-hosted deployments with EXECUTE_COMMAND_ENABLED=true.',
  version: '1.0.0',

  params: {
    command: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'The shell command to execute on the host machine',
    },
    timeout: {
      type: 'number',
      required: false,
      visibility: 'hidden',
      description: 'Execution timeout in milliseconds',
      default: DEFAULT_EXECUTION_TIMEOUT_MS,
    },
    workingDirectory: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Working directory for the command. Defaults to the server process cwd.',
    },
    envVars: {
      type: 'object',
      required: false,
      visibility: 'hidden',
      description: 'Environment variables to make available during execution',
      default: {},
    },
    blockData: {
      type: 'object',
      required: false,
      visibility: 'hidden',
      description: 'Block output data for variable resolution',
      default: {},
    },
    blockNameMapping: {
      type: 'object',
      required: false,
      visibility: 'hidden',
      description: 'Mapping of block names to block IDs',
      default: {},
    },
    blockOutputSchemas: {
      type: 'object',
      required: false,
      visibility: 'hidden',
      description: 'Mapping of block IDs to their output schemas for validation',
      default: {},
    },
    workflowVariables: {
      type: 'object',
      required: false,
      visibility: 'hidden',
      description: 'Workflow variables for <variable.name> resolution',
      default: {},
    },
  },

  request: {
    url: '/api/execute-command/run',
    method: 'POST',
    headers: () => ({
      'Content-Type': 'application/json',
    }),
    body: (params: ExecuteCommandInput) => ({
      command: params.command,
      timeout: params.timeout || DEFAULT_EXECUTION_TIMEOUT_MS,
      workingDirectory: params.workingDirectory,
      envVars: params.envVars || {},
      workflowVariables: params.workflowVariables || {},
      blockData: params.blockData || {},
      blockNameMapping: params.blockNameMapping || {},
      blockOutputSchemas: params.blockOutputSchemas || {},
      workflowId: params._context?.workflowId,
      userId: params._context?.userId,
    }),
  },

  transformResponse: async (response: Response): Promise<ExecuteCommandOutput> => {
    const result = await response.json()

    if (!result.success) {
      return {
        success: false,
        output: {
          stdout: result.output?.stdout || '',
          stderr: result.output?.stderr || '',
          exitCode: result.output?.exitCode ?? 1,
        },
        error: result.error,
      }
    }

    return {
      success: true,
      output: {
        stdout: result.output.stdout,
        stderr: result.output.stderr,
        exitCode: result.output.exitCode,
      },
    }
  },

  outputs: {
    stdout: { type: 'string', description: 'Standard output from the command' },
    stderr: { type: 'string', description: 'Standard error output from the command' },
    exitCode: { type: 'number', description: 'Exit code of the command (0 = success)' },
  },
}
