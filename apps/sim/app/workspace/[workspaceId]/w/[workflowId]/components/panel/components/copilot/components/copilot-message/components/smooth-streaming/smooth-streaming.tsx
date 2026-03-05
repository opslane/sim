import { memo } from 'react'
import { StreamingIndicator, StreamingText } from '@/components/ui/streaming-text'
import { CopilotMarkdownRenderer } from '../markdown-renderer'

export { StreamingIndicator }

const renderCopilotMarkdown = (content: string) => <CopilotMarkdownRenderer content={content} />

/** Props for the SmoothStreamingText component */
interface SmoothStreamingTextProps {
  content: string
  isStreaming: boolean
}

/** Copilot-specific streaming text that renders with CopilotMarkdownRenderer */
export const SmoothStreamingText = memo(
  ({ content, isStreaming }: SmoothStreamingTextProps) => {
    return (
      <StreamingText content={content} isStreaming={isStreaming} renderer={renderCopilotMarkdown} />
    )
  },
  (prevProps, nextProps) => {
    return (
      prevProps.content === nextProps.content && prevProps.isStreaming === nextProps.isStreaming
    )
  }
)

SmoothStreamingText.displayName = 'SmoothStreamingText'
