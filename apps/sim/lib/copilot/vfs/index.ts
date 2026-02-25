export type {
  DirEntry,
  GrepCountEntry,
  GrepMatch,
  GrepOptions,
  GrepOutputMode,
  ReadResult,
} from '@/lib/copilot/vfs/operations'
export {
  serializeBlockSchema,
  serializeDocuments,
  serializeIntegrationSchema,
  serializeKBMeta,
  serializeRecentExecutions,
  serializeWorkflowMeta,
} from '@/lib/copilot/vfs/serializers'
export { getOrMaterializeVFS, WorkspaceVFS } from '@/lib/copilot/vfs/workspace-vfs'
