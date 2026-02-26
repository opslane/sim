import { db } from '@sim/db'
import {
  account,
  knowledgeBase,
  userTableDefinitions,
  userTableRows,
  workflow,
  workspaceFiles,
} from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { and, count, eq, isNull } from 'drizzle-orm'

const logger = createLogger('WorkspaceContext')

/**
 * Generate WORKSPACE.md content from actual database state.
 * This is injected into the system prompt — the LLM never writes it directly.
 */
export async function generateWorkspaceContext(
  workspaceId: string,
  userId: string
): Promise<string> {
  try {
    const [workflows, kbs, tables, files, credentials] = await Promise.all([
      db
        .select({
          id: workflow.id,
          name: workflow.name,
          description: workflow.description,
          isDeployed: workflow.isDeployed,
          lastRunAt: workflow.lastRunAt,
        })
        .from(workflow)
        .where(eq(workflow.workspaceId, workspaceId)),

      db
        .select({
          id: knowledgeBase.id,
          name: knowledgeBase.name,
          description: knowledgeBase.description,
        })
        .from(knowledgeBase)
        .where(and(eq(knowledgeBase.workspaceId, workspaceId), isNull(knowledgeBase.deletedAt))),

      db
        .select({
          id: userTableDefinitions.id,
          name: userTableDefinitions.name,
          description: userTableDefinitions.description,
        })
        .from(userTableDefinitions)
        .where(eq(userTableDefinitions.workspaceId, workspaceId)),

      db
        .select({
          id: workspaceFiles.id,
          originalName: workspaceFiles.originalName,
          contentType: workspaceFiles.contentType,
          size: workspaceFiles.size,
        })
        .from(workspaceFiles)
        .where(eq(workspaceFiles.workspaceId, workspaceId)),

      db
        .select({
          providerId: account.providerId,
          scope: account.scope,
        })
        .from(account)
        .where(eq(account.userId, userId)),
    ])

    const sections: string[] = []

    // Workflows
    if (workflows.length > 0) {
      const lines = workflows.map((wf) => {
        const parts = [`- **${wf.name}** (${wf.id})`]
        if (wf.description) parts.push(`  ${wf.description}`)
        const flags: string[] = []
        if (wf.isDeployed) flags.push('deployed')
        if (wf.lastRunAt) flags.push(`last run: ${wf.lastRunAt.toISOString().split('T')[0]}`)
        if (flags.length > 0) parts[0] += ` — ${flags.join(', ')}`
        return parts.join('\n')
      })
      sections.push(`## Workflows\n${lines.join('\n')}`)
    } else {
      sections.push('## Workflows\n(none)')
    }

    // Knowledge Bases
    if (kbs.length > 0) {
      const lines = kbs.map((kb) => {
        let line = `- **${kb.name}** (${kb.id})`
        if (kb.description) line += ` — ${kb.description}`
        return line
      })
      sections.push(`## Knowledge Bases\n${lines.join('\n')}`)
    } else {
      sections.push('## Knowledge Bases\n(none)')
    }

    // Tables (live row counts)
    if (tables.length > 0) {
      const rowCounts = await Promise.all(
        tables.map(async (t) => {
          const [row] = await db
            .select({ count: count() })
            .from(userTableRows)
            .where(eq(userTableRows.tableId, t.id))
          return row?.count ?? 0
        })
      )
      const lines = tables.map((t, i) => {
        let line = `- **${t.name}** (${t.id}) — ${rowCounts[i]} rows`
        if (t.description) line += `, ${t.description}`
        return line
      })
      sections.push(`## Tables\n${lines.join('\n')}`)
    } else {
      sections.push('## Tables\n(none)')
    }

    // Files
    if (files.length > 0) {
      const lines = files.map(
        (f) => `- **${f.originalName}** (${f.contentType}, ${formatSize(f.size)})`
      )
      sections.push(`## Files\n${lines.join('\n')}`)
    } else {
      sections.push('## Files\n(none)')
    }

    // Credentials
    if (credentials.length > 0) {
      const providers = [...new Set(credentials.map((c) => c.providerId))]
      sections.push(`## Credentials\nConnected: ${providers.join(', ')}`)
    } else {
      sections.push('## Credentials\n(none)')
    }

    return sections.join('\n\n')
  } catch (err) {
    logger.error('Failed to generate workspace context', {
      workspaceId,
      error: err instanceof Error ? err.message : String(err),
    })
    return '## Workflows\n(unavailable)\n\n## Knowledge Bases\n(unavailable)\n\n## Tables\n(unavailable)\n\n## Files\n(unavailable)\n\n## Credentials\n(unavailable)'
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}
