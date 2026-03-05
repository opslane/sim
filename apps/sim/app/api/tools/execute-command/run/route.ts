import { exec } from 'child_process'
import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { isExecuteCommandEnabled } from '@/lib/core/config/feature-flags'
import { generateRequestId } from '@/lib/core/utils/request'
import { normalizeName, REFERENCE } from '@/executor/constants'
import { type OutputSchema, resolveBlockReference } from '@/executor/utils/block-reference'
import {
  createEnvVarPattern,
  createWorkflowVariablePattern,
} from '@/executor/utils/reference-validation'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const MAX_DURATION = 210

const logger = createLogger('ExecuteCommandAPI')

const MAX_BUFFER = 10 * 1024 * 1024 // 10MB

/**
 * Resolves workflow variables (<variable.name>) by replacing them with their actual values
 */
function resolveWorkflowVariables(command: string, workflowVariables: Record<string, any>): string {
  let resolved = command
  const regex = createWorkflowVariablePattern()
  let match: RegExpExecArray | null
  const replacements: Array<{ match: string; index: number; value: string }> = []

  while ((match = regex.exec(command)) !== null) {
    const variableName = match[1].trim()
    const foundVariable = Object.entries(workflowVariables).find(
      ([_, variable]) => normalizeName(variable.name || '') === normalizeName(variableName)
    )

    if (!foundVariable) {
      const availableVars = Object.values(workflowVariables)
        .map((v: any) => v.name)
        .filter(Boolean)
      throw new Error(
        `Variable "${variableName}" doesn't exist.` +
          (availableVars.length > 0 ? ` Available: ${availableVars.join(', ')}` : '')
      )
    }

    const variable = foundVariable[1]
    let value = variable.value

    if (typeof value === 'object' && value !== null) {
      value = JSON.stringify(value)
    } else {
      value = String(value ?? '')
    }

    replacements.push({ match: match[0], index: match.index, value })
  }

  for (let i = replacements.length - 1; i >= 0; i--) {
    const { match: matchStr, index, value } = replacements[i]
    resolved = resolved.slice(0, index) + value + resolved.slice(index + matchStr.length)
  }

  return resolved
}

/**
 * Resolves environment variables ({{ENV_VAR}}) by replacing them with their actual values
 */
function resolveEnvironmentVariables(command: string, envVars: Record<string, string>): string {
  let resolved = command
  const regex = createEnvVarPattern()
  let match: RegExpExecArray | null
  const replacements: Array<{ match: string; index: number; value: string }> = []

  while ((match = regex.exec(command)) !== null) {
    const varName = match[1].trim()
    if (!(varName in envVars)) {
      continue
    }
    replacements.push({ match: match[0], index: match.index, value: envVars[varName] })
  }

  for (let i = replacements.length - 1; i >= 0; i--) {
    const { match: matchStr, index, value } = replacements[i]
    resolved = resolved.slice(0, index) + value + resolved.slice(index + matchStr.length)
  }

  return resolved
}

/**
 * Resolves block reference tags (<blockName.field>) by replacing them with their actual values
 */
function resolveTagVariables(
  command: string,
  blockData: Record<string, unknown>,
  blockNameMapping: Record<string, string>,
  blockOutputSchemas: Record<string, OutputSchema>
): string {
  const tagPattern = new RegExp(
    `${REFERENCE.START}([a-zA-Z_](?:[a-zA-Z0-9_${REFERENCE.PATH_DELIMITER}]*[a-zA-Z0-9_])?)${REFERENCE.END}`,
    'g'
  )

  const replacements: Array<{ match: string; index: number; value: string }> = []
  let match: RegExpExecArray | null

  while ((match = tagPattern.exec(command)) !== null) {
    const tagName = match[1].trim()
    const pathParts = tagName.split(REFERENCE.PATH_DELIMITER)
    const blockName = pathParts[0]
    const fieldPath = pathParts.slice(1)

    const result = resolveBlockReference(blockName, fieldPath, {
      blockNameMapping,
      blockData,
      blockOutputSchemas,
    })

    if (!result) {
      continue
    }

    let stringValue: string
    if (result.value === undefined || result.value === null) {
      stringValue = ''
    } else if (typeof result.value === 'object') {
      stringValue = JSON.stringify(result.value)
    } else {
      stringValue = String(result.value)
    }

    replacements.push({ match: match[0], index: match.index, value: stringValue })
  }

  let resolved = command
  for (let i = replacements.length - 1; i >= 0; i--) {
    const { match: matchStr, index, value } = replacements[i]
    resolved = resolved.slice(0, index) + value + resolved.slice(index + matchStr.length)
  }

  return resolved
}

/**
 * Resolves all variable references in a command string
 */
function resolveCommandVariables(
  command: string,
  envVars: Record<string, string>,
  blockData: Record<string, unknown>,
  blockNameMapping: Record<string, string>,
  blockOutputSchemas: Record<string, OutputSchema>,
  workflowVariables: Record<string, unknown>
): string {
  let resolved = command
  resolved = resolveWorkflowVariables(resolved, workflowVariables)
  resolved = resolveEnvironmentVariables(resolved, envVars)
  resolved = resolveTagVariables(resolved, blockData, blockNameMapping, blockOutputSchemas)
  return resolved
}

interface CommandResult {
  stdout: string
  stderr: string
  exitCode: number
  timedOut: boolean
  maxBufferExceeded: boolean
}

/**
 * Execute a shell command and return stdout, stderr, exitCode.
 * Distinguishes between a process that exited with non-zero (normal) and one that was killed (timeout).
 */
function executeCommand(
  command: string,
  options: { timeout: number; cwd?: string; env?: Record<string, string> }
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const childProcess = exec(
      command,
      {
        timeout: options.timeout,
        cwd: options.cwd || undefined,
        maxBuffer: MAX_BUFFER,
        env: { ...process.env, ...options.env },
      },
      (error, stdout, stderr) => {
        if (error) {
          const killed = error.killed ?? false
          const isMaxBuffer = killed && /maxBuffer/.test(error.message ?? '')
          const exitCode = typeof error.code === 'number' ? error.code : 1
          resolve({
            stdout: stdout.trimEnd(),
            stderr: stderr.trimEnd(),
            exitCode,
            timedOut: killed && !isMaxBuffer,
            maxBufferExceeded: isMaxBuffer,
          })
          return
        }
        resolve({
          stdout: stdout.trimEnd(),
          stderr: stderr.trimEnd(),
          exitCode: 0,
          timedOut: false,
          maxBufferExceeded: false,
        })
      }
    )

    childProcess.on('error', (err) => {
      resolve({
        stdout: '',
        stderr: err.message,
        exitCode: 1,
        timedOut: false,
        maxBufferExceeded: false,
      })
    })
  })
}

export async function POST(req: NextRequest) {
  const requestId = generateRequestId()

  try {
    if (!isExecuteCommandEnabled) {
      logger.warn(`[${requestId}] Execute Command is disabled`)
      return NextResponse.json(
        {
          success: false,
          error:
            'Execute Command is not enabled. Set EXECUTE_COMMAND_ENABLED=true in your environment to use this feature. Only available for self-hosted deployments.',
        },
        { status: 403 }
      )
    }

    const auth = await checkInternalAuth(req)
    if (!auth.success || !auth.userId) {
      logger.warn(`[${requestId}] Unauthorized execute command attempt`)
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { DEFAULT_EXECUTION_TIMEOUT_MS } = await import('@/lib/execution/constants')

    const {
      command,
      workingDirectory,
      envVars = {},
      blockData = {},
      blockNameMapping = {},
      blockOutputSchemas = {},
      workflowVariables = {},
      workflowId,
    } = body

    const parsedTimeout = Number(body.timeout)
    const timeout = parsedTimeout > 0 ? parsedTimeout : DEFAULT_EXECUTION_TIMEOUT_MS

    if (!command || typeof command !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Command is required and must be a string' },
        { status: 400 }
      )
    }

    logger.info(`[${requestId}] Execute command request`, {
      commandLength: command.length,
      timeout,
      workingDirectory: workingDirectory || '(default)',
      workflowId,
    })

    const resolvedCommand = resolveCommandVariables(
      command,
      envVars,
      blockData,
      blockNameMapping,
      blockOutputSchemas,
      workflowVariables
    )

    const result = await executeCommand(resolvedCommand, {
      timeout,
      cwd: workingDirectory,
      env: envVars,
    })

    logger.info(`[${requestId}] Command completed`, {
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      stdoutLength: result.stdout.length,
      stderrLength: result.stderr.length,
      workflowId,
    })

    if (result.timedOut) {
      return NextResponse.json({
        success: false,
        output: {
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
        },
        error: `Command timed out after ${timeout}ms`,
      })
    }

    if (result.maxBufferExceeded) {
      return NextResponse.json({
        success: false,
        output: {
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
        },
        error: `Command output exceeded maximum buffer size of ${MAX_BUFFER / 1024 / 1024}MB`,
      })
    }

    return NextResponse.json({
      success: true,
      output: {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error(`[${requestId}] Execute command failed`, { error: message })
    return NextResponse.json(
      {
        success: false,
        output: { stdout: '', stderr: message, exitCode: 1 },
        error: message,
      },
      { status: 500 }
    )
  }
}
