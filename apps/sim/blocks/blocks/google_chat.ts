import { GoogleChatIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'
import { AuthMode } from '@/blocks/types'
import type { GoogleChatResponse } from '@/tools/google_chat/types'

export const GoogleChatBlock: BlockConfig<GoogleChatResponse> = {
  type: 'google_chat',
  name: 'Google Chat',
  description: 'Send messages and manage Google Chat spaces',
  authMode: AuthMode.OAuth,
  longDescription:
    'Integrate with Google Chat to send messages to spaces and list available spaces using OAuth.',
  docsLink: 'https://docs.sim.ai/tools/google_chat',
  category: 'tools',
  bgColor: '#E0E0E0',
  icon: GoogleChatIcon,
  subBlocks: [
    {
      id: 'operation',
      title: 'Operation',
      type: 'dropdown',
      options: [
        { label: 'Send Message', id: 'send_message' },
        { label: 'List Spaces', id: 'list_spaces' },
      ],
      value: () => 'send_message',
    },
    {
      id: 'credential',
      title: 'Google Chat Account',
      type: 'oauth-input',
      canonicalParamId: 'oauthCredential',
      mode: 'basic',
      required: true,
      serviceId: 'google-chat',
      requiredScopes: [
        'https://www.googleapis.com/auth/chat.spaces.readonly',
        'https://www.googleapis.com/auth/chat.messages.create',
      ],
      placeholder: 'Select Google account',
    },
    {
      id: 'manualCredential',
      title: 'Google Chat Account',
      type: 'short-input',
      canonicalParamId: 'oauthCredential',
      mode: 'advanced',
      placeholder: 'Enter credential ID',
      required: true,
    },
    {
      id: 'spaceId',
      title: 'Space ID',
      type: 'short-input',
      placeholder: 'e.g., spaces/AAAA1234 or AAAA1234',
      required: { field: 'operation', value: 'send_message' },
      condition: { field: 'operation', value: 'send_message' },
    },
    {
      id: 'message',
      title: 'Message',
      type: 'long-input',
      placeholder: 'Enter your message',
      required: { field: 'operation', value: 'send_message' },
      condition: { field: 'operation', value: 'send_message' },
    },
    {
      id: 'threadKey',
      title: 'Thread Key',
      type: 'short-input',
      placeholder: 'Optional thread key for threaded replies',
      condition: { field: 'operation', value: 'send_message' },
    },
    {
      id: 'filter',
      title: 'Filter',
      type: 'short-input',
      placeholder: 'e.g., spaceType = "SPACE"',
      condition: { field: 'operation', value: 'list_spaces' },
    },
    {
      id: 'pageSize',
      title: 'Max Results',
      type: 'short-input',
      placeholder: 'Maximum spaces to return (default 100)',
      condition: { field: 'operation', value: 'list_spaces' },
    },
  ],
  tools: {
    access: ['google_chat_send_message', 'google_chat_list_spaces'],
    config: {
      tool: (params) => {
        switch (params.operation) {
          case 'send_message':
            return 'google_chat_send_message'
          case 'list_spaces':
            return 'google_chat_list_spaces'
          default:
            throw new Error(`Invalid Google Chat operation: ${params.operation}`)
        }
      },
      params: (params) => {
        const { oauthCredential, operation, ...rest } = params

        switch (operation) {
          case 'send_message':
            return {
              oauthCredential,
              spaceId: rest.spaceId,
              message: rest.message,
              threadKey: rest.threadKey,
            }
          case 'list_spaces':
            return {
              oauthCredential,
              pageSize: rest.pageSize ? Number(rest.pageSize) : undefined,
              filter: rest.filter,
            }
          default:
            return { oauthCredential, ...rest }
        }
      },
    },
  },
  inputs: {
    operation: { type: 'string', description: 'Operation to perform' },
    oauthCredential: { type: 'string', description: 'Google Chat OAuth credential' },
    spaceId: { type: 'string', description: 'Google Chat space ID' },
    message: { type: 'string', description: 'Message text to send' },
    threadKey: { type: 'string', description: 'Thread key for threaded replies' },
    filter: { type: 'string', description: 'Filter by space type' },
    pageSize: { type: 'number', description: 'Maximum number of spaces to return' },
  },
  outputs: {
    messageName: { type: 'string', description: 'Message resource name' },
    spaceName: { type: 'string', description: 'Space resource name' },
    threadName: { type: 'string', description: 'Thread resource name' },
    text: { type: 'string', description: 'Message text that was sent' },
    createTime: { type: 'string', description: 'Message creation timestamp' },
    spaces: { type: 'json', description: 'Array of Google Chat space objects' },
    nextPageToken: { type: 'string', description: 'Token for next page of results' },
  },
}
