import { DEFAULT_EXECUTION_TIMEOUT_MS } from '@/lib/execution/constants'
import { BlockType } from '@/executor/constants'
import type { BlockHandler, ExecutionContext } from '@/executor/types'
import { collectBlockData } from '@/executor/utils/block-data'
import type { SerializedBlock } from '@/serializer/types'
import { executeTool } from '@/tools'

/**
 * Handler for Execute Command blocks that run shell commands on the host machine.
 */
export class ExecuteCommandBlockHandler implements BlockHandler {
  canHandle(block: SerializedBlock): boolean {
    return block.metadata?.id === BlockType.EXECUTE_COMMAND
  }

  async execute(
    ctx: ExecutionContext,
    block: SerializedBlock,
    inputs: Record<string, any>
  ): Promise<any> {
    const { blockData, blockNameMapping, blockOutputSchemas } = collectBlockData(ctx)

    const result = await executeTool(
      'execute_command_run',
      {
        command: inputs.command,
        timeout: inputs.timeout || DEFAULT_EXECUTION_TIMEOUT_MS,
        workingDirectory: inputs.workingDirectory,
        envVars: ctx.environmentVariables || {},
        workflowVariables: ctx.workflowVariables || {},
        blockData,
        blockNameMapping,
        blockOutputSchemas,
        _context: {
          workflowId: ctx.workflowId,
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          isDeployedContext: ctx.isDeployedContext,
          enforceCredentialAccess: ctx.enforceCredentialAccess,
        },
      },
      false,
      ctx
    )

    if (!result.success) {
      throw new Error(result.error || 'Command execution failed')
    }

    return result.output
  }
}
