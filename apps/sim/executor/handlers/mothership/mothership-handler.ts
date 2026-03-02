import { createLogger } from '@sim/logger'
import type { BlockOutput } from '@/blocks/types'
import { BlockType } from '@/executor/constants'
import type { BlockHandler, ExecutionContext } from '@/executor/types'
import { buildAPIUrl, buildAuthHeaders, extractAPIErrorMessage } from '@/executor/utils/http'
import type { SerializedBlock } from '@/serializer/types'

const logger = createLogger('MothershipBlockHandler')

/**
 * Handler for Mothership blocks that proxy requests to the Mothership AI agent.
 *
 * Unlike the Agent block (which calls LLM providers directly), the Mothership
 * block delegates to the full Mothership infrastructure: main agent, subagents,
 * integration tools, memory, and workspace context.
 */
export class MothershipBlockHandler implements BlockHandler {
  canHandle(block: SerializedBlock): boolean {
    return block.metadata?.id === BlockType.MOTHERSHIP
  }

  async execute(
    ctx: ExecutionContext,
    block: SerializedBlock,
    inputs: Record<string, any>
  ): Promise<BlockOutput> {
    const messages = this.resolveMessages(inputs)
    const responseFormat = this.parseResponseFormat(inputs.responseFormat)

    const memoryType = inputs.memoryType || 'none'
    const chatId =
      memoryType === 'conversation' && inputs.conversationId
        ? inputs.conversationId
        : crypto.randomUUID()

    const url = buildAPIUrl('/api/mothership/execute')
    const headers = await buildAuthHeaders()

    const body: Record<string, unknown> = {
      messages,
      workspaceId: ctx.workspaceId || '',
      userId: ctx.userId || '',
      chatId,
    }
    if (responseFormat) {
      body.responseFormat = responseFormat
    }

    logger.info('Executing Mothership block', {
      blockId: block.id,
      messageCount: messages.length,
      hasResponseFormat: !!responseFormat,
      memoryType,
      hasConversationId: memoryType === 'conversation',
    })

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorMsg = await extractAPIErrorMessage(response)
      throw new Error(`Mothership execution failed: ${errorMsg}`)
    }

    const result = await response.json()

    if (responseFormat && result.content) {
      return this.processStructuredResponse(result)
    }

    return {
      content: result.content || '',
      model: result.model || 'mothership',
      tokens: result.tokens || {},
    }
  }

  private resolveMessages(
    inputs: Record<string, any>
  ): Array<{ role: string; content: string }> {
    const raw = inputs.messages
    if (!raw) {
      throw new Error('Messages input is required for the Mothership block')
    }

    let messages: unknown[]
    if (typeof raw === 'string') {
      try {
        messages = JSON.parse(raw)
      } catch {
        throw new Error('Messages must be a valid JSON array')
      }
    } else if (Array.isArray(raw)) {
      messages = raw
    } else {
      throw new Error('Messages must be an array of {role, content} objects')
    }

    return messages.map((msg: any, i: number) => {
      if (!msg.role || typeof msg.content !== 'string') {
        throw new Error(
          `Message at index ${i} must have "role" (string) and "content" (string)`
        )
      }
      return { role: String(msg.role), content: msg.content }
    })
  }

  private parseResponseFormat(responseFormat?: string | object): any {
    if (!responseFormat || responseFormat === '') return undefined

    if (typeof responseFormat === 'object') return responseFormat

    if (typeof responseFormat === 'string') {
      const trimmed = responseFormat.trim()
      if (!trimmed) return undefined
      if (trimmed.startsWith('<') || trimmed.startsWith('{{')) return undefined
      try {
        return JSON.parse(trimmed)
      } catch {
        logger.warn('Failed to parse responseFormat as JSON', {
          preview: trimmed.slice(0, 100),
        })
        return undefined
      }
    }

    return undefined
  }

  private processStructuredResponse(result: any): BlockOutput {
    const content = result.content
    try {
      const parsed = JSON.parse(content.trim())
      return {
        ...parsed,
        model: result.model || 'mothership',
        tokens: result.tokens || {},
      }
    } catch {
      logger.warn('Failed to parse structured response, returning raw content')
      return {
        content,
        model: result.model || 'mothership',
        tokens: result.tokens || {},
      }
    }
  }
}
