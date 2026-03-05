import type { ToolResponse } from '@/tools/types'

export interface ExecuteCommandInput {
  command: string
  timeout?: number
  workingDirectory?: string
  envVars?: Record<string, string>
  workflowVariables?: Record<string, unknown>
  blockData?: Record<string, unknown>
  blockNameMapping?: Record<string, string>
  blockOutputSchemas?: Record<string, Record<string, unknown>>
  _context?: {
    workflowId?: string
    userId?: string
  }
}

export interface ExecuteCommandOutput extends ToolResponse {
  output: {
    stdout: string
    stderr: string
    exitCode: number
  }
}
