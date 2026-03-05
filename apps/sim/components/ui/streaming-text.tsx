'use client'

import { memo, type ReactNode, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/core/utils/cn'

/** Target characters to advance per animation frame (~30 chars/frame at 60fps ≈ 1800 chars/sec) */
const CHARS_PER_FRAME = 30

/** Props for the StreamingIndicator component */
interface StreamingIndicatorProps {
  className?: string
}

/** Shows animated dots during message streaming when no content has arrived */
export const StreamingIndicator = memo(({ className }: StreamingIndicatorProps) => (
  <div className={cn('flex h-[1.25rem] items-center text-muted-foreground', className)}>
    <div className='flex space-x-0.5'>
      <div className='h-1 w-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms] [animation-duration:1.2s]' />
      <div className='h-1 w-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms] [animation-duration:1.2s]' />
      <div className='h-1 w-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms] [animation-duration:1.2s]' />
    </div>
  </div>
))

StreamingIndicator.displayName = 'StreamingIndicator'

/** Props for the StreamingText component */
interface StreamingTextProps {
  content: string
  isStreaming: boolean
  renderer?: (content: string) => ReactNode
}

/** Default renderer: plain span with whitespace-pre-wrap */
function DefaultRenderer({ content }: { content: string }) {
  return <span className='whitespace-pre-wrap'>{content}</span>
}

/** Displays text with character-by-character animation using rAF batching for smooth streaming */
export const StreamingText = memo(
  ({ content, isStreaming, renderer }: StreamingTextProps) => {
    const [displayedContent, setDisplayedContent] = useState(() => (isStreaming ? '' : content))
    const contentRef = useRef(content)
    const rafRef = useRef<number | null>(null)
    const indexRef = useRef(isStreaming ? 0 : content.length)
    const isAnimatingRef = useRef(false)

    useEffect(() => {
      contentRef.current = content

      if (content.length === 0) {
        setDisplayedContent('')
        indexRef.current = 0
        return
      }

      if (isStreaming) {
        if (indexRef.current < content.length) {
          const animateText = () => {
            const currentContent = contentRef.current
            const currentIndex = indexRef.current
            if (currentIndex < currentContent.length) {
              const nextIndex = Math.min(currentIndex + CHARS_PER_FRAME, currentContent.length)
              setDisplayedContent(currentContent.slice(0, nextIndex))
              indexRef.current = nextIndex
              rafRef.current = requestAnimationFrame(animateText)
            } else {
              isAnimatingRef.current = false
            }
          }

          if (!isAnimatingRef.current) {
            if (rafRef.current) {
              cancelAnimationFrame(rafRef.current)
            }
            isAnimatingRef.current = true
            rafRef.current = requestAnimationFrame(animateText)
          }
        }
      } else {
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current)
        }
        setDisplayedContent(content)
        indexRef.current = content.length
        isAnimatingRef.current = false
      }

      return () => {
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current)
        }
        isAnimatingRef.current = false
      }
    }, [content, isStreaming])

    return (
      <div className='min-h-[1.25rem] max-w-full'>
        {renderer ? renderer(displayedContent) : <DefaultRenderer content={displayedContent} />}
      </div>
    )
  },
  (prevProps, nextProps) => {
    return (
      prevProps.content === nextProps.content &&
      prevProps.isStreaming === nextProps.isStreaming &&
      prevProps.renderer === nextProps.renderer
    )
  }
)

StreamingText.displayName = 'StreamingText'
