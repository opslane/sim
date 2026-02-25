import type { GoogleChatResponse, GoogleChatSendMessageParams } from '@/tools/google_chat/types'
import type { ToolConfig } from '@/tools/types'

export const sendMessageTool: ToolConfig<GoogleChatSendMessageParams, GoogleChatResponse> = {
  id: 'google_chat_send_message',
  name: 'Google Chat Send Message',
  description: 'Send a message to a Google Chat space',
  version: '1.0.0',

  oauth: {
    required: true,
    provider: 'google-chat',
  },

  params: {
    accessToken: {
      type: 'string',
      required: true,
      visibility: 'hidden',
      description: 'OAuth access token',
    },
    spaceId: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'The Google Chat space ID (e.g., spaces/AAAA1234)',
    },
    message: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Message text to send',
    },
    threadKey: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Thread key for sending a threaded reply',
    },
  },

  request: {
    url: (params) => {
      const spaceId = params.spaceId?.trim()
      if (!spaceId) {
        throw new Error('Space ID is required')
      }
      const spaceName = spaceId.startsWith('spaces/') ? spaceId : `spaces/${spaceId}`
      const url = new URL(`https://chat.googleapis.com/v1/${spaceName}/messages`)
      if (params.threadKey) {
        url.searchParams.set(
          'messageReplyOption',
          'REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD'
        )
      }
      return url.toString()
    },
    method: 'POST',
    headers: (params) => ({
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
    }),
    body: (params) => {
      const body: Record<string, unknown> = {
        text: params.message,
      }
      if (params.threadKey) {
        body.thread = { threadKey: params.threadKey }
      }
      return body
    },
  },

  transformResponse: async (response) => {
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error?.message || 'Failed to send message')
    }
    return {
      success: true,
      output: {
        messageName: data.name ?? null,
        spaceName: data.space?.name ?? null,
        threadName: data.thread?.name ?? null,
        text: data.text ?? null,
        createTime: data.createTime ?? null,
      },
    }
  },

  outputs: {
    messageName: { type: 'string', description: 'Google Chat message resource name' },
    spaceName: { type: 'string', description: 'Space the message was sent to' },
    threadName: { type: 'string', description: 'Thread resource name', optional: true },
    text: { type: 'string', description: 'Message text that was sent' },
    createTime: { type: 'string', description: 'Timestamp when the message was created' },
  },
}
