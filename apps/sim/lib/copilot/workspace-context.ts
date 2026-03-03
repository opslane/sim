import { db } from '@sim/db'
import {
  account,
  copilotChats,
  knowledgeBase,
  userTableDefinitions,
  userTableRows,
  workflow,
  workspace,
} from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { and, count, desc, eq, isNull } from 'drizzle-orm'
import { listWorkspaceFiles } from '@/lib/uploads/contexts/workspace'
import { getUsersWithPermissions } from '@/lib/workspaces/permissions/utils'

const logger = createLogger('WorkspaceContext')

/**
 * Generate WORKSPACE.md content from actual database state.
 * Auto-injected into the system prompt and served as a top-level VFS file.
 * The LLM never writes it directly.
 */
export async function generateWorkspaceContext(
  workspaceId: string,
  userId: string
): Promise<string> {
  try {
    const [wsRow, members, workflows, kbs, tables, files, credentials, recentTasks] =
      await Promise.all([
        db
          .select({ id: workspace.id, name: workspace.name, ownerId: workspace.ownerId })
          .from(workspace)
          .where(eq(workspace.id, workspaceId))
          .limit(1)
          .then((rows) => rows[0] ?? null),

        getUsersWithPermissions(workspaceId),

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

        listWorkspaceFiles(workspaceId),

        db
          .select({
            providerId: account.providerId,
            scope: account.scope,
          })
          .from(account)
          .where(eq(account.userId, userId)),

        db
          .select({
            id: copilotChats.id,
            title: copilotChats.title,
            updatedAt: copilotChats.updatedAt,
          })
          .from(copilotChats)
          .where(
            and(
              eq(copilotChats.workspaceId, workspaceId),
              eq(copilotChats.userId, userId),
              eq(copilotChats.type, 'mothership')
            )
          )
          .orderBy(desc(copilotChats.updatedAt))
          .limit(5),
      ])

    const sections: string[] = []

    // Workspace identity
    if (wsRow) {
      sections.push(
        `## Workspace\n- **Name**: ${wsRow.name}\n- **ID**: ${wsRow.id}\n- **Owner**: ${wsRow.ownerId}`
      )
    }

    // Members & permissions
    if (members.length > 0) {
      const lines = members.map((m) => {
        const display = m.name ? `${m.name} (${m.email})` : m.email
        return `- ${display} — ${m.permissionType}`
      })
      sections.push(`## Members\n${lines.join('\n')}`)
    }

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
      sections.push(`## Workflows (${workflows.length})\n${lines.join('\n')}`)
    } else {
      sections.push('## Workflows (0)\n(none)')
    }

    // Knowledge Bases
    if (kbs.length > 0) {
      const lines = kbs.map((kb) => {
        let line = `- **${kb.name}** (${kb.id})`
        if (kb.description) line += ` — ${kb.description}`
        return line
      })
      sections.push(`## Knowledge Bases (${kbs.length})\n${lines.join('\n')}`)
    } else {
      sections.push('## Knowledge Bases (0)\n(none)')
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
      sections.push(`## Tables (${tables.length})\n${lines.join('\n')}`)
    } else {
      sections.push('## Tables (0)\n(none)')
    }

    // Files
    if (files.length > 0) {
      const lines = files.map((f) => `- **${f.name}** (${f.type}, ${formatSize(f.size)})`)
      sections.push(`## Files (${files.length})\n${lines.join('\n')}`)
    } else {
      sections.push('## Files (0)\n(none)')
    }

    // Credentials
    if (credentials.length > 0) {
      const providers = [...new Set(credentials.map((c) => c.providerId))]
      sections.push(`## Credentials\nConnected: ${providers.join(', ')}`)
    } else {
      sections.push('## Credentials\n(none)')
    }

    // Recent tasks (mothership conversations)
    if (recentTasks.length > 0) {
      const lines = recentTasks.map((t) => {
        const date = t.updatedAt.toISOString().split('T')[0]
        return `- **${t.title || 'Untitled'}** (${t.id}) — ${date}`
      })
      sections.push(`## Recent Tasks (${recentTasks.length})\n${lines.join('\n')}`)
    }

    return sections.join('\n\n')
  } catch (err) {
    logger.error('Failed to generate workspace context', {
      workspaceId,
      error: err instanceof Error ? err.message : String(err),
    })
    return '## Workspace\n(unavailable)\n\n## Workflows\n(unavailable)\n\n## Knowledge Bases\n(unavailable)\n\n## Tables\n(unavailable)\n\n## Files\n(unavailable)\n\n## Credentials\n(unavailable)'
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}
