import type { GoogleChatListSpacesParams, GoogleChatResponse } from '@/tools/google_chat/types'
import type { ToolConfig } from '@/tools/types'

export const listSpacesTool: ToolConfig<GoogleChatListSpacesParams, GoogleChatResponse> = {
  id: 'google_chat_list_spaces',
  name: 'Google Chat List Spaces',
  description: 'List Google Chat spaces the user is a member of',
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
    pageSize: {
      type: 'number',
      required: false,
      visibility: 'user-or-llm',
      description: 'Maximum number of spaces to return (default 100, max 1000)',
    },
    pageToken: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Token for fetching the next page of results',
    },
    filter: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description:
        'Filter by space type (e.g., spaceType = "SPACE", spaceType = "GROUP_CHAT" OR spaceType = "DIRECT_MESSAGE")',
    },
  },

  request: {
    url: (params) => {
      const url = new URL('https://chat.googleapis.com/v1/spaces')
      if (params.pageSize) {
        url.searchParams.set('pageSize', String(params.pageSize))
      }
      if (params.pageToken) {
        url.searchParams.set('pageToken', params.pageToken)
      }
      if (params.filter) {
        url.searchParams.set('filter', params.filter)
      }
      return url.toString()
    },
    method: 'GET',
    headers: (params) => ({
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
    }),
  },

  transformResponse: async (response) => {
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error?.message || 'Failed to list spaces')
    }
    return {
      success: true,
      output: {
        spaces: data.spaces ?? [],
        nextPageToken: data.nextPageToken ?? null,
      },
    }
  },

  outputs: {
    spaces: {
      type: 'json',
      description: 'Array of Google Chat space objects',
    },
    nextPageToken: {
      type: 'string',
      description: 'Token for fetching the next page of results',
      optional: true,
    },
  },
}
