import type { ToolResponse } from '@/tools/types'

/**
 * Common parameters for Google Chat API calls
 */
export interface GoogleChatCommonParams {
  accessToken: string
}

/**
 * Parameters for sending a message to a Google Chat space
 */
export interface GoogleChatSendMessageParams extends GoogleChatCommonParams {
  spaceId: string
  message: string
  threadKey?: string
}

/**
 * Parameters for listing Google Chat spaces
 */
export interface GoogleChatListSpacesParams extends GoogleChatCommonParams {
  pageSize?: number
  pageToken?: string
  filter?: string
}

/**
 * Standard response for Google Chat operations
 */
export interface GoogleChatResponse extends ToolResponse {
  output: Record<string, unknown>
}
