import { exec } from 'child_process'
import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { isExecuteCommandEnabled } from '@/lib/core/config/feature-flags'
import { generateRequestId } from '@/lib/core/utils/request'
import { DEFAULT_EXECUTION_TIMEOUT_MS } from '@/lib/execution/constants'
import { normalizeName, REFERENCE, SPECIAL_REFERENCE_PREFIXES } from '@/executor/constants'
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

const SAFE_ENV_KEYS = ['PATH', 'HOME', 'SHELL', 'USER', 'LOGNAME', 'LANG', 'TERM', 'TZ'] as const

/**
 * Returns a minimal base environment for child processes.
 * Only includes POSIX essentials — never server secrets like DATABASE_URL, AUTH_SECRET, etc.
 */
function getSafeBaseEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { NODE_ENV: process.env.NODE_ENV }
  for (const key of SAFE_ENV_KEYS) {
    if (process.env[key]) {
      env[key] = process.env[key]
    }
  }
  return env
}

const BLOCKED_ENV_KEYS = new Set([
  ...SAFE_ENV_KEYS,
  'NODE_ENV',
  'NODE_OPTIONS',
  'LD_PRELOAD',
  'LD_LIBRARY_PATH',
  'LD_AUDIT',
  'DYLD_INSERT_LIBRARIES',
  'DYLD_LIBRARY_PATH',
  'DYLD_FRAMEWORK_PATH',
  'BASH_ENV',
  'ENV',
  'GLIBC_TUNABLES',
  'NODE_PATH',
  'PYTHONPATH',
  'PERL5LIB',
  'PERL5OPT',
  'RUBYLIB',
  'JAVA_TOOL_OPTIONS',
])

/**
 * Filters user-supplied env vars to prevent overriding safe base env
 * and injecting process-influencing variables.
 */
function filterUserEnv(env?: Record<string, string>): Record<string, string> {
  if (!env) return {}
  const filtered: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (!BLOCKED_ENV_KEYS.has(key)) {
      filtered[key] = value
    }
  }
  return filtered
}

interface Replacement {
  index: number
  length: number
  value: string
}

/**
 * Collects workflow variable (<variable.name>) replacements from the original command string
 */
function collectWorkflowVariableReplacements(
  command: string,
  workflowVariables: Record<string, any>
): Replacement[] {
  const regex = createWorkflowVariablePattern()
  const replacements: Replacement[] = []
  let match: RegExpExecArray | null

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

    replacements.push({ index: match.index, length: match[0].length, value })
  }

  return replacements
}

/**
 * Collects environment variable ({{ENV_VAR}}) replacements from the original command string
 */
function collectEnvVarReplacements(
  command: string,
  envVars: Record<string, string>
): Replacement[] {
  const regex = createEnvVarPattern()
  const replacements: Replacement[] = []
  let match: RegExpExecArray | null

  while ((match = regex.exec(command)) !== null) {
    const varName = match[1].trim()
    if (!(varName in envVars)) {
      continue
    }
    replacements.push({ index: match.index, length: match[0].length, value: envVars[varName] })
  }

  return replacements
}

/**
 * Collects block reference tag (<blockName.field>) replacements from the original command string
 */
function collectTagReplacements(
  command: string,
  blockData: Record<string, unknown>,
  blockNameMapping: Record<string, string>,
  blockOutputSchemas: Record<string, OutputSchema>
): Replacement[] {
  const tagPattern = new RegExp(
    `${REFERENCE.START}(\\S[^${REFERENCE.START}${REFERENCE.END}]*)${REFERENCE.END}`,
    'g'
  )

  const replacements: Replacement[] = []
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
      const isSpecialPrefix = SPECIAL_REFERENCE_PREFIXES.some((prefix) => blockName === prefix)
      if (!isSpecialPrefix) {
        throw new Error(
          `Block reference "<${tagName}>" could not be resolved. Check that the block name and field path are correct.`
        )
      }
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

    replacements.push({ index: match.index, length: match[0].length, value: stringValue })
  }

  return replacements
}

/**
 * Resolves all variable references in a command string in a single pass.
 * All three patterns are matched against the ORIGINAL command to prevent
 * cascading resolution (e.g. a workflow variable value containing {{ENV_VAR}}
 * would NOT be further resolved).
 */
function resolveCommandVariables(
  command: string,
  envVars: Record<string, string>,
  blockData: Record<string, unknown>,
  blockNameMapping: Record<string, string>,
  blockOutputSchemas: Record<string, OutputSchema>,
  workflowVariables: Record<string, unknown>
): string {
  const allReplacements = [
    ...collectWorkflowVariableReplacements(command, workflowVariables),
    ...collectEnvVarReplacements(command, envVars),
    ...collectTagReplacements(command, blockData, blockNameMapping, blockOutputSchemas),
  ]

  allReplacements.sort((a, b) => a.index - b.index)

  for (let i = 1; i < allReplacements.length; i++) {
    const prev = allReplacements[i - 1]
    const curr = allReplacements[i]
    if (curr.index < prev.index + prev.length) {
      throw new Error(
        `Overlapping variable references detected at positions ${prev.index} and ${curr.index}`
      )
    }
  }

  let resolved = command
  for (let i = allReplacements.length - 1; i >= 0; i--) {
    const { index, length, value } = allReplacements[i]
    resolved = resolved.slice(0, index) + value + resolved.slice(index + length)
  }

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
        env: { ...getSafeBaseEnv(), ...filterUserEnv(options.env) },
      },
      (error, stdout, stderr) => {
        if (error) {
          const killed = error.killed ?? false
          const isMaxBuffer = /maxBuffer/i.test(error.message ?? '')
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

    const MAX_ALLOWED_TIMEOUT_MS = (MAX_DURATION - 10) * 1000
    const parsedTimeout = Number(body.timeout)
    const timeout = Math.min(
      parsedTimeout > 0 ? parsedTimeout : DEFAULT_EXECUTION_TIMEOUT_MS,
      MAX_ALLOWED_TIMEOUT_MS
    )

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
