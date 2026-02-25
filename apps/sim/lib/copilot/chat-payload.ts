import { createLogger } from '@sim/logger'
import { processFileAttachments } from '@/lib/copilot/chat-context'
import { isHosted } from '@/lib/core/config/feature-flags'
import { tools } from '@/tools/registry'
import { getLatestVersionTools, stripVersionSuffix } from '@/tools/utils'

const logger = createLogger('CopilotChatPayload')

export interface BuildPayloadParams {
  message: string
  workflowId?: string
  workflowName?: string
  userId: string
  userMessageId: string
  mode: string
  model: string
  provider?: string
  conversationHistory?: unknown[]
  contexts?: Array<{ type: string; content: string }>
  fileAttachments?: Array<{ id: string; key: string; size: number; [key: string]: unknown }>
  commands?: string[]
  chatId?: string
  prefetch?: boolean
  implicitFeedback?: string
}

interface ToolSchema {
  name: string
  description: string
  input_schema: Record<string, unknown>
  defer_loading?: boolean
  executeLocally?: boolean
  oauth?: { required: boolean; provider: string }
}

/**
 * Build the request payload for the copilot backend.
 */
export async function buildCopilotRequestPayload(
  params: BuildPayloadParams,
  options: {
    selectedModel: string
  }
): Promise<Record<string, unknown>> {
  const {
    message,
    workflowId,
    userId,
    userMessageId,
    mode,
    provider,
    contexts,
    fileAttachments,
    commands,
    chatId,
    prefetch,
    conversationHistory,
    implicitFeedback,
  } = params

  const selectedModel = options.selectedModel

  const effectiveMode = mode === 'agent' ? 'build' : mode
  const transportMode = effectiveMode === 'build' ? 'agent' : effectiveMode

  const processedFileContents = await processFileAttachments(fileAttachments ?? [], userId)

  const integrationTools: ToolSchema[] = []

  if (effectiveMode === 'build') {
    try {
      const { createUserToolSchema } = await import('@/tools/params')
      const latestTools = getLatestVersionTools(tools)

      for (const [toolId, toolConfig] of Object.entries(latestTools)) {
        try {
          const userSchema = createUserToolSchema(toolConfig)
          const strippedName = stripVersionSuffix(toolId)
          integrationTools.push({
            name: strippedName,
            description: toolConfig.description || toolConfig.name || strippedName,
            input_schema: userSchema as unknown as Record<string, unknown>,
            defer_loading: true,
            ...(toolConfig.oauth?.required && {
              oauth: {
                required: true,
                provider: toolConfig.oauth.provider,
              },
            }),
          })
        } catch (toolError) {
          logger.warn('Failed to build schema for tool, skipping', {
            toolId,
            error: toolError instanceof Error ? toolError.message : String(toolError),
          })
        }
      }
    } catch (error) {
      logger.warn('Failed to build tool schemas for payload', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return {
    message,
    ...(workflowId ? { workflowId } : {}),
    ...(params.workflowName ? { workflowName: params.workflowName } : {}),
    userId,
    ...(selectedModel ? { model: selectedModel } : {}),
    ...(provider ? { provider } : {}),
    mode: transportMode,
    messageId: userMessageId,
    ...(contexts && contexts.length > 0 ? { context: contexts } : {}),
    ...(chatId ? { chatId } : {}),
    ...(Array.isArray(conversationHistory) && conversationHistory.length > 0
      ? { conversationHistory }
      : {}),
    ...(typeof prefetch === 'boolean' ? { prefetch } : {}),
    ...(implicitFeedback ? { implicitFeedback } : {}),
    ...(processedFileContents.length > 0 ? { fileAttachments: processedFileContents } : {}),
    ...(integrationTools.length > 0 ? { integrationTools } : {}),
    ...(commands && commands.length > 0 ? { commands } : {}),
    isHosted,
  }
}
