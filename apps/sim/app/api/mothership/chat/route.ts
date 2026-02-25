import { db } from '@sim/db'
import { copilotChats } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { buildConversationHistory } from '@/lib/copilot/chat-context'
import { resolveOrCreateChat } from '@/lib/copilot/chat-lifecycle'
import { buildCopilotRequestPayload } from '@/lib/copilot/chat-payload'
import { SIM_AGENT_API_URL } from '@/lib/copilot/constants'
import { orchestrateCopilotStream } from '@/lib/copilot/orchestrator'
import {
  createStreamEventWriter,
  resetStreamBuffer,
  setStreamMeta,
} from '@/lib/copilot/orchestrator/stream-buffer'
import {
  createBadRequestResponse,
  createRequestTracker,
  createUnauthorizedResponse,
} from '@/lib/copilot/request-helpers'
import { env } from '@/lib/core/config/env'

const logger = createLogger('MothershipChatAPI')

async function requestChatTitleFromCopilot(params: {
  message: string
  model: string
  provider?: string
}): Promise<string | null> {
  const { message, model, provider } = params
  if (!message || !model) return null

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (env.COPILOT_API_KEY) {
    headers['x-api-key'] = env.COPILOT_API_KEY
  }

  try {
    const response = await fetch(`${SIM_AGENT_API_URL}/api/generate-chat-title`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message, model, ...(provider ? { provider } : {}) }),
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      logger.warn('Failed to generate chat title via copilot backend', {
        status: response.status,
        error: payload,
      })
      return null
    }

    const title = typeof payload?.title === 'string' ? payload.title.trim() : ''
    return title || null
  } catch (error) {
    logger.error('Error generating chat title:', error)
    return null
  }
}

const FileAttachmentSchema = z.object({
  id: z.string(),
  key: z.string(),
  filename: z.string(),
  media_type: z.string(),
  size: z.number(),
})

const MothershipMessageSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  workspaceId: z.string().min(1, 'workspaceId is required'),
  userMessageId: z.string().optional(),
  chatId: z.string().optional(),
  createNewChat: z.boolean().optional().default(false),
  fileAttachments: z.array(FileAttachmentSchema).optional(),
  contexts: z
    .array(
      z.object({
        kind: z.enum([
          'past_chat',
          'workflow',
          'current_workflow',
          'blocks',
          'logs',
          'workflow_block',
          'knowledge',
          'templates',
          'docs',
        ]),
        label: z.string(),
        chatId: z.string().optional(),
        workflowId: z.string().optional(),
        knowledgeId: z.string().optional(),
        blockId: z.string().optional(),
        blockIds: z.array(z.string()).optional(),
        templateId: z.string().optional(),
        executionId: z.string().optional(),
      })
    )
    .optional(),
})

/**
 * POST /api/mothership/chat
 * Workspace-scoped chat — no workflowId, proxies to Go /api/mothership.
 */
export async function POST(req: NextRequest) {
  const tracker = createRequestTracker()

  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return createUnauthorizedResponse()
    }

    const authenticatedUserId = session.user.id
    const body = await req.json()
    const {
      message,
      workspaceId,
      userMessageId: providedMessageId,
      chatId,
      createNewChat,
      fileAttachments,
      contexts,
    } = MothershipMessageSchema.parse(body)

    const userMessageId = providedMessageId || crypto.randomUUID()

    let agentContexts: Array<{ type: string; content: string }> = []
    if (Array.isArray(contexts) && contexts.length > 0) {
      try {
        const { processContextsServer } = await import('@/lib/copilot/process-contents')
        agentContexts = await processContextsServer(
          contexts as any,
          authenticatedUserId,
          message
        )
      } catch (e) {
        logger.error(`[${tracker.requestId}] Failed to process contexts`, e)
      }
    }

    let currentChat: any = null
    let conversationHistory: any[] = []
    let actualChatId = chatId

    if (chatId || createNewChat) {
      const chatResult = await resolveOrCreateChat({
        chatId,
        userId: authenticatedUserId,
        workspaceId,
        model: 'claude-opus-4-5',
      })
      currentChat = chatResult.chat
      actualChatId = chatResult.chatId || chatId
      const history = buildConversationHistory(chatResult.conversationHistory)
      conversationHistory = history.history
    }

    const requestPayload = await buildCopilotRequestPayload(
      {
        message,
        userId: authenticatedUserId,
        userMessageId,
        mode: 'agent',
        model: '',
        conversationHistory,
        contexts: agentContexts,
        fileAttachments,
        chatId: actualChatId,
      },
      { selectedModel: '' }
    )

    const streamId = userMessageId
    let eventWriter: ReturnType<typeof createStreamEventWriter> | null = null
    let clientDisconnected = false

    const transformedStream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder()

          await resetStreamBuffer(streamId)
          await setStreamMeta(streamId, { status: 'active', userId: authenticatedUserId })
          eventWriter = createStreamEventWriter(streamId)

          const shouldFlushEvent = (event: Record<string, any>) =>
            event.type === 'tool_call' ||
            event.type === 'tool_result' ||
            event.type === 'tool_error' ||
            event.type === 'subagent_end' ||
            event.type === 'structured_result' ||
            event.type === 'subagent_result' ||
            event.type === 'done' ||
            event.type === 'error'

          const pushEvent = async (event: Record<string, any>) => {
            if (!eventWriter) return
            const entry = await eventWriter.write(event)
            if (shouldFlushEvent(event)) {
              await eventWriter.flush()
            }
            const payload = {
              ...event,
              eventId: entry.eventId,
              streamId,
            }
            try {
              if (!clientDisconnected) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
              }
            } catch {
              clientDisconnected = true
              await eventWriter.flush()
            }
          }

          if (actualChatId) {
            await pushEvent({ type: 'chat_id', chatId: actualChatId })
          }

          if (actualChatId && !currentChat?.title && conversationHistory.length === 0) {
            requestChatTitleFromCopilot({ message, model: 'claude-opus-4-5' })
              .then(async (title) => {
                if (title) {
                  await db
                    .update(copilotChats)
                    .set({ title, updatedAt: new Date() })
                    .where(eq(copilotChats.id, actualChatId!))
                  await pushEvent({ type: 'title_updated', title })
                }
              })
              .catch((error) => {
                logger.error(`[${tracker.requestId}] Title generation failed:`, error)
              })
          }

          try {
            const result = await orchestrateCopilotStream(requestPayload, {
              userId: authenticatedUserId,
              workspaceId,
              chatId: actualChatId,
              goRoute: '/api/mothership',
              autoExecuteTools: true,
              interactive: false,
              onEvent: async (event) => {
                await pushEvent(event)
              },
            })

            if (currentChat) {
              await db
                .update(copilotChats)
                .set({ updatedAt: new Date() })
                .where(eq(copilotChats.id, actualChatId!))
            }
            await eventWriter.close()
            await setStreamMeta(streamId, { status: 'complete', userId: authenticatedUserId })
          } catch (error) {
            logger.error(`[${tracker.requestId}] Orchestration error:`, error)
            await eventWriter.close()
            await setStreamMeta(streamId, {
              status: 'error',
              userId: authenticatedUserId,
              error: error instanceof Error ? error.message : 'Stream error',
            })
            await pushEvent({
              type: 'error',
              data: {
                displayMessage: 'An unexpected error occurred while processing the response.',
              },
            })
          } finally {
            controller.close()
          }
        },
        async cancel() {
          clientDisconnected = true
          if (eventWriter) {
            await eventWriter.flush()
          }
        },
      })

    return new Response(transformedStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      )
    }

    logger.error(`[${tracker.requestId}] Error handling mothership chat:`, {
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
