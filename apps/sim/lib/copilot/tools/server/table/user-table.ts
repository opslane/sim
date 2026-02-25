import { createLogger } from '@sim/logger'
import type { BaseServerTool, ServerToolContext } from '@/lib/copilot/tools/server/base-tool'
import type { UserTableArgs, UserTableResult } from '@/lib/copilot/tools/shared/schemas'
import {
  batchInsertRows,
  createTable,
  deleteRow,
  deleteRowsByFilter,
  deleteTable,
  getRowById,
  getTableById,
  insertRow,
  listTables,
  queryRows,
  updateRow,
  updateRowsByFilter,
} from '@/lib/table/service'

const logger = createLogger('UserTableServerTool')

export const userTableServerTool: BaseServerTool<UserTableArgs, UserTableResult> = {
  name: 'user_table',
  async execute(params: UserTableArgs, context?: ServerToolContext): Promise<UserTableResult> {
    if (!context?.userId) {
      logger.error('Unauthorized attempt to access user table - no authenticated user context')
      throw new Error('Authentication required')
    }

    const { operation, args = {} } = params
    const workspaceId =
      context.workspaceId || ((args as Record<string, unknown>).workspaceId as string | undefined)

    try {
      switch (operation) {
        case 'create': {
          if (!args.name) {
            return { success: false, message: 'Name is required for creating a table' }
          }
          if (!args.schema) {
            return { success: false, message: 'Schema is required for creating a table' }
          }
          if (!workspaceId) {
            return { success: false, message: 'Workspace ID is required' }
          }

          const requestId = crypto.randomUUID().slice(0, 8)
          const table = await createTable(
            {
              name: args.name,
              description: args.description,
              schema: args.schema,
              workspaceId,
              userId: context.userId,
            },
            requestId
          )

          return {
            success: true,
            message: `Created table "${table.name}" (${table.id})`,
            data: { table },
          }
        }

        case 'list': {
          if (!workspaceId) {
            return { success: false, message: 'Workspace ID is required' }
          }

          const tables = await listTables(workspaceId)
          return {
            success: true,
            message: `Found ${tables.length} table(s)`,
            data: { tables, totalCount: tables.length },
          }
        }

        case 'get': {
          if (!args.tableId) {
            return { success: false, message: 'Table ID is required' }
          }

          const table = await getTableById(args.tableId)
          if (!table) {
            return { success: false, message: `Table not found: ${args.tableId}` }
          }

          return {
            success: true,
            message: `Table "${table.name}" has ${table.rowCount} rows`,
            data: { table },
          }
        }

        case 'get_schema': {
          if (!args.tableId) {
            return { success: false, message: 'Table ID is required' }
          }

          const table = await getTableById(args.tableId)
          if (!table) {
            return { success: false, message: `Table not found: ${args.tableId}` }
          }

          return {
            success: true,
            message: `Schema for "${table.name}"`,
            data: { name: table.name, columns: table.schema.columns },
          }
        }

        case 'delete': {
          if (!args.tableId) {
            return { success: false, message: 'Table ID is required' }
          }

          const requestId = crypto.randomUUID().slice(0, 8)
          await deleteTable(args.tableId, requestId)

          return {
            success: true,
            message: `Deleted table ${args.tableId}`,
          }
        }

        case 'insert_row': {
          if (!args.tableId) {
            return { success: false, message: 'Table ID is required' }
          }
          if (!args.data) {
            return { success: false, message: 'Data is required for inserting a row' }
          }
          if (!workspaceId) {
            return { success: false, message: 'Workspace ID is required' }
          }

          const table = await getTableById(args.tableId)
          if (!table) {
            return { success: false, message: `Table not found: ${args.tableId}` }
          }

          const requestId = crypto.randomUUID().slice(0, 8)
          const row = await insertRow(
            { tableId: args.tableId, data: args.data, workspaceId },
            table,
            requestId
          )

          return {
            success: true,
            message: `Inserted row ${row.id}`,
            data: { row },
          }
        }

        case 'batch_insert_rows': {
          if (!args.tableId) {
            return { success: false, message: 'Table ID is required' }
          }
          if (!args.rows || args.rows.length === 0) {
            return { success: false, message: 'Rows array is required and must not be empty' }
          }
          if (!workspaceId) {
            return { success: false, message: 'Workspace ID is required' }
          }

          const table = await getTableById(args.tableId)
          if (!table) {
            return { success: false, message: `Table not found: ${args.tableId}` }
          }

          const requestId = crypto.randomUUID().slice(0, 8)
          const rows = await batchInsertRows(
            { tableId: args.tableId, rows: args.rows, workspaceId },
            table,
            requestId
          )

          return {
            success: true,
            message: `Inserted ${rows.length} rows`,
            data: { rows, insertedCount: rows.length },
          }
        }

        case 'get_row': {
          if (!args.tableId) {
            return { success: false, message: 'Table ID is required' }
          }
          if (!args.rowId) {
            return { success: false, message: 'Row ID is required' }
          }
          if (!workspaceId) {
            return { success: false, message: 'Workspace ID is required' }
          }

          const row = await getRowById(args.tableId, args.rowId, workspaceId)
          if (!row) {
            return { success: false, message: `Row not found: ${args.rowId}` }
          }

          return {
            success: true,
            message: `Row ${row.id}`,
            data: { row },
          }
        }

        case 'query_rows': {
          if (!args.tableId) {
            return { success: false, message: 'Table ID is required' }
          }
          if (!workspaceId) {
            return { success: false, message: 'Workspace ID is required' }
          }

          const requestId = crypto.randomUUID().slice(0, 8)
          const result = await queryRows(
            args.tableId,
            workspaceId,
            {
              filter: args.filter,
              sort: args.sort,
              limit: args.limit,
              offset: args.offset,
            },
            requestId
          )

          return {
            success: true,
            message: `Returned ${result.rows.length} of ${result.totalCount} rows`,
            data: result,
          }
        }

        case 'update_row': {
          if (!args.tableId) {
            return { success: false, message: 'Table ID is required' }
          }
          if (!args.rowId) {
            return { success: false, message: 'Row ID is required' }
          }
          if (!args.data) {
            return { success: false, message: 'Data is required for updating a row' }
          }
          if (!workspaceId) {
            return { success: false, message: 'Workspace ID is required' }
          }

          const table = await getTableById(args.tableId)
          if (!table) {
            return { success: false, message: `Table not found: ${args.tableId}` }
          }

          const requestId = crypto.randomUUID().slice(0, 8)
          const updatedRow = await updateRow(
            { tableId: args.tableId, rowId: args.rowId, data: args.data, workspaceId },
            table,
            requestId
          )

          return {
            success: true,
            message: `Updated row ${updatedRow.id}`,
            data: { row: updatedRow },
          }
        }

        case 'delete_row': {
          if (!args.tableId) {
            return { success: false, message: 'Table ID is required' }
          }
          if (!args.rowId) {
            return { success: false, message: 'Row ID is required' }
          }
          if (!workspaceId) {
            return { success: false, message: 'Workspace ID is required' }
          }

          const requestId = crypto.randomUUID().slice(0, 8)
          await deleteRow(args.tableId, args.rowId, workspaceId, requestId)

          return {
            success: true,
            message: `Deleted row ${args.rowId}`,
          }
        }

        case 'update_rows_by_filter': {
          if (!args.tableId) {
            return { success: false, message: 'Table ID is required' }
          }
          if (!args.filter) {
            return { success: false, message: 'Filter is required for bulk update' }
          }
          if (!args.data) {
            return { success: false, message: 'Data is required for bulk update' }
          }
          if (!workspaceId) {
            return { success: false, message: 'Workspace ID is required' }
          }

          const table = await getTableById(args.tableId)
          if (!table) {
            return { success: false, message: `Table not found: ${args.tableId}` }
          }

          const requestId = crypto.randomUUID().slice(0, 8)
          const result = await updateRowsByFilter(
            {
              tableId: args.tableId,
              filter: args.filter,
              data: args.data,
              limit: args.limit,
              workspaceId,
            },
            table,
            requestId
          )

          return {
            success: true,
            message: `Updated ${result.affectedCount} rows`,
            data: { affectedCount: result.affectedCount, affectedRowIds: result.affectedRowIds },
          }
        }

        case 'delete_rows_by_filter': {
          if (!args.tableId) {
            return { success: false, message: 'Table ID is required' }
          }
          if (!args.filter) {
            return { success: false, message: 'Filter is required for bulk delete' }
          }
          if (!workspaceId) {
            return { success: false, message: 'Workspace ID is required' }
          }

          const requestId = crypto.randomUUID().slice(0, 8)
          const result = await deleteRowsByFilter(
            {
              tableId: args.tableId,
              filter: args.filter,
              limit: args.limit,
              workspaceId,
            },
            requestId
          )

          return {
            success: true,
            message: `Deleted ${result.affectedCount} rows`,
            data: { affectedCount: result.affectedCount, affectedRowIds: result.affectedRowIds },
          }
        }

        default:
          return { success: false, message: `Unknown operation: ${operation}` }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Table operation failed', { operation, error: errorMessage })
      return { success: false, message: `Operation failed: ${errorMessage}` }
    }
  },
}
