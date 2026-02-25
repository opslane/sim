'use client'

import { useCallback, useRef, useState } from 'react'
import { Check, CircleAlert, Loader2, Send, Square, Zap } from 'lucide-react'
import { useParams } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/emcn'
import { MOTHERSHIP_CHAT_API_PATH } from '@/lib/copilot/constants'

const REMARK_PLUGINS = [remarkGfm]

// ── Types ──

interface SSEEvent {
  timestamp: string
  raw: string
}

type ToolCallStatus = 'executing' | 'success' | 'error'

interface ToolCallInfo {
  id: string
  name: string
  status: ToolCallStatus
  displayTitle?: string
}

type ContentBlockType = 'text' | 'tool_call' | 'subagent'

interface ContentBlock {
  type: ContentBlockType
  content?: string
  toolCall?: ToolCallInfo
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  contentBlocks?: ContentBlock[]
}

const SUBAGENT_LABELS: Record<string, string> = {
  build: 'Building',
  deploy: 'Deploying',
  auth: 'Connecting credentials',
  research: 'Researching',
  knowledge: 'Managing knowledge base',
  table: 'Managing tables',
  custom_tool: 'Creating tool',
  superagent: 'Executing action',
  plan: 'Planning',
  debug: 'Debugging',
  edit: 'Editing workflow',
}

// ── Rendered chat components ──

function ToolStatusIcon({ status }: { status: ToolCallStatus }) {
  switch (status) {
    case 'executing':
      return <Loader2 className='h-3 w-3 animate-spin text-[var(--text-tertiary)]' />
    case 'success':
      return <Check className='h-3 w-3 text-emerald-500' />
    case 'error':
      return <CircleAlert className='h-3 w-3 text-red-400' />
  }
}

function ToolCallItem({ toolCall }: { toolCall: ToolCallInfo }) {
  const label =
    toolCall.displayTitle ||
    toolCall.name
      .replace(/_v\d+$/, '')
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')

  return (
    <div className='flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5'>
      <Zap className='h-3 w-3 flex-shrink-0 text-[var(--text-tertiary)]' />
      <span className='min-w-0 flex-1 truncate text-[var(--text-secondary)] text-xs'>{label}</span>
      <ToolStatusIcon status={toolCall.status} />
    </div>
  )
}

function AssistantBlocks({
  blocks,
  isStreaming,
}: {
  blocks: ContentBlock[]
  isStreaming: boolean
}) {
  return (
    <div className='space-y-2'>
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'text': {
            if (!block.content?.trim()) return null
            return (
              <div key={`text-${i}`} className='prose-sm prose-invert max-w-none'>
                <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{block.content}</ReactMarkdown>
              </div>
            )
          }
          case 'tool_call': {
            if (!block.toolCall) return null
            return <ToolCallItem key={block.toolCall.id} toolCall={block.toolCall} />
          }
          case 'subagent': {
            if (!block.content) return null
            const isLast = isStreaming && blocks.slice(i + 1).every((b) => b.type !== 'subagent')
            if (!isLast) return null
            return (
              <div key={`sub-${i}`} className='flex items-center gap-2 py-0.5'>
                <Loader2 className='h-3 w-3 animate-spin text-[var(--text-tertiary)]' />
                <span className='text-[var(--text-tertiary)] text-xs'>{block.content}</span>
              </div>
            )
          }
          default:
            return null
        }
      })}
    </div>
  )
}

// ── Main component ──

export function Chat() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const [inputValue, setInputValue] = useState('')
  const [events, setEvents] = useState<SSEEvent[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const chatIdRef = useRef<string | undefined>(undefined)
  const rawBottomRef = useRef<HTMLDivElement>(null)
  const chatBottomRef = useRef<HTMLDivElement>(null)

  const sendMessage = useCallback(
    async (message: string) => {
      if (!message.trim() || !workspaceId) return

      setError(null)
      setIsSending(true)

      const userMessageId = crypto.randomUUID()
      const assistantId = crypto.randomUUID()

      setEvents((prev) => [
        ...prev,
        { timestamp: new Date().toISOString(), raw: JSON.stringify({ type: 'user', message }) },
      ])

      setMessages((prev) => [
        ...prev,
        { id: userMessageId, role: 'user', content: message },
        { id: assistantId, role: 'assistant', content: '', contentBlocks: [] },
      ])

      const abortController = new AbortController()
      abortControllerRef.current = abortController

      const blocks: ContentBlock[] = []
      const toolMap = new Map<string, number>()

      const ensureTextBlock = (): ContentBlock => {
        const last = blocks[blocks.length - 1]
        if (last?.type === 'text') return last
        const b: ContentBlock = { type: 'text', content: '' }
        blocks.push(b)
        return b
      }

      const flush = () => {
        const text = blocks
          .filter((b) => b.type === 'text')
          .map((b) => b.content ?? '')
          .join('')
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: text, contentBlocks: [...blocks] } : m
          )
        )
      }

      try {
        const response = await fetch(MOTHERSHIP_CHAT_API_PATH, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message,
            workspaceId,
            userMessageId,
            createNewChat: !chatIdRef.current,
            ...(chatIdRef.current ? { chatId: chatIdRef.current } : {}),
          }),
          signal: abortController.signal,
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || `Request failed: ${response.status}`)
        }

        if (!response.body) throw new Error('No response body')

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const payload = line.slice(6)

            setEvents((prev) => [...prev, { timestamp: new Date().toISOString(), raw: payload }])

            let parsed: any
            try {
              parsed = JSON.parse(payload)
            } catch {
              continue
            }

            switch (parsed.type) {
              case 'chat_id': {
                if (parsed.chatId) chatIdRef.current = parsed.chatId
                break
              }
              case 'content': {
                const chunk = typeof parsed.data === 'string' ? parsed.data : parsed.content || ''
                if (chunk) {
                  const tb = ensureTextBlock()
                  tb.content = (tb.content ?? '') + chunk
                  flush()
                }
                break
              }
              case 'tool_generating':
              case 'tool_call': {
                const id = parsed.toolCallId
                const name = parsed.toolName || parsed.data?.name || 'unknown'
                if (!id) break
                const ui = parsed.ui || parsed.data?.ui
                if (ui?.hidden) break
                const displayTitle = ui?.title || ui?.phaseLabel
                if (!toolMap.has(id)) {
                  toolMap.set(id, blocks.length)
                  blocks.push({
                    type: 'tool_call',
                    toolCall: { id, name, status: 'executing', displayTitle },
                  })
                } else {
                  const idx = toolMap.get(id)!
                  const tc = blocks[idx].toolCall
                  if (tc) {
                    tc.name = name
                    if (displayTitle) tc.displayTitle = displayTitle
                  }
                }
                flush()
                break
              }
              case 'tool_result': {
                const id = parsed.toolCallId || parsed.data?.id
                if (!id) break
                const idx = toolMap.get(id)
                if (idx !== undefined && blocks[idx].toolCall) {
                  blocks[idx].toolCall!.status = parsed.success ? 'success' : 'error'
                  flush()
                }
                break
              }
              case 'tool_error': {
                const id = parsed.toolCallId || parsed.data?.id
                if (!id) break
                const idx = toolMap.get(id)
                if (idx !== undefined && blocks[idx].toolCall) {
                  blocks[idx].toolCall!.status = 'error'
                  flush()
                }
                break
              }
              case 'subagent_start': {
                const name = parsed.subagent || parsed.data?.agent
                if (name) {
                  blocks.push({ type: 'subagent', content: SUBAGENT_LABELS[name] || name })
                  flush()
                }
                break
              }
              case 'subagent_end': {
                flush()
                break
              }
              case 'error': {
                setError(parsed.error || 'An error occurred')
                break
              }
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        const msg = err instanceof Error ? err.message : 'Failed to send message'
        setError(msg)
      } finally {
        setIsSending(false)
        abortControllerRef.current = null
        rawBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
        chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      }
    },
    [workspaceId]
  )

  const handleSubmit = useCallback(() => {
    const trimmed = inputValue.trim()
    if (!trimmed) return
    setInputValue('')
    sendMessage(trimmed)
  }, [inputValue, sendMessage])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  const clear = () => {
    setEvents([])
    setMessages([])
    chatIdRef.current = undefined
  }

  return (
    <div className='flex h-full flex-col'>
      <div className='flex flex-shrink-0 items-center justify-between border-[var(--border)] border-b px-6 py-3'>
        <h1 className='font-medium text-[16px] text-[var(--text-primary)]'>Mothership</h1>
        {(events.length > 0 || messages.length > 0) && (
          <button
            onClick={clear}
            className='text-[var(--text-tertiary)] text-xs hover:text-[var(--text-secondary)]'
          >
            Clear
          </button>
        )}
      </div>

      {/* Split pane: left = rendered chat, right = raw SSE */}
      <div className='flex min-h-0 flex-1'>
        {/* Rendered chat */}
        <div className='flex w-1/2 flex-col border-[var(--border)] border-r'>
          <div className='border-[var(--border)] border-b px-4 py-2'>
            <span className='font-medium text-[var(--text-tertiary)] text-xs'>Chat</span>
          </div>
          <div className='flex-1 overflow-y-auto px-4 py-4'>
            {messages.length === 0 ? (
              <div className='flex h-full items-center justify-center'>
                <p className='text-[var(--text-tertiary)] text-sm'>Send a message to start</p>
              </div>
            ) : (
              <div className='space-y-4'>
                {messages.map((msg) => {
                  if (msg.role === 'user') {
                    return (
                      <div key={msg.id} className='flex justify-end'>
                        <div className='max-w-[85%] rounded-lg bg-[var(--accent)] px-4 py-2 text-[var(--accent-foreground)] text-sm'>
                          <p className='whitespace-pre-wrap'>{msg.content}</p>
                        </div>
                      </div>
                    )
                  }

                  const hasBlocks = msg.contentBlocks && msg.contentBlocks.length > 0
                  const isThisStreaming = isSending && msg === messages[messages.length - 1]

                  if (!hasBlocks && !msg.content && isThisStreaming) {
                    return (
                      <div key={msg.id} className='flex justify-start'>
                        <div className='flex items-center gap-2 rounded-lg bg-[var(--surface-3)] px-4 py-2 text-[var(--text-secondary)] text-sm'>
                          <Loader2 className='h-3 w-3 animate-spin' />
                          Thinking...
                        </div>
                      </div>
                    )
                  }

                  if (!hasBlocks && !msg.content) return null

                  return (
                    <div key={msg.id} className='flex justify-start'>
                      <div className='max-w-[85%] rounded-lg bg-[var(--surface-3)] px-4 py-2 text-[var(--text-primary)] text-sm'>
                        {hasBlocks ? (
                          <AssistantBlocks
                            blocks={msg.contentBlocks!}
                            isStreaming={isThisStreaming}
                          />
                        ) : (
                          <div className='prose-sm prose-invert max-w-none'>
                            <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
                <div ref={chatBottomRef} />
              </div>
            )}
          </div>
        </div>

        {/* Raw SSE events */}
        <div className='flex w-1/2 flex-col'>
          <div className='border-[var(--border)] border-b px-4 py-2'>
            <span className='font-medium text-[var(--text-tertiary)] text-xs'>Raw SSE</span>
          </div>
          <div className='flex-1 overflow-y-auto bg-[var(--surface-1)] font-mono text-xs'>
            {events.map((evt, i) => (
              <div
                key={i}
                className='border-[var(--border)] border-b px-4 py-2 hover:bg-[var(--surface-2)]'
              >
                <span className='mr-2 text-[var(--text-tertiary)]'>
                  {new Date(evt.timestamp).toLocaleTimeString()}
                </span>
                <span className='whitespace-pre-wrap break-all text-[var(--text-primary)]'>
                  {evt.raw}
                </span>
              </div>
            ))}
            <div ref={rawBottomRef} />
          </div>
        </div>
      </div>

      {error && (
        <div className='px-6 pb-2'>
          <p className='text-red-500 text-xs'>{error}</p>
        </div>
      )}

      <div className='flex-shrink-0 border-[var(--border)] border-t px-6 py-4'>
        <div className='mx-auto flex max-w-3xl items-end gap-2'>
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder='Send a message...'
            rows={1}
            className='flex-1 resize-none rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2.5 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none'
            style={{ maxHeight: '120px' }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement
              target.style.height = 'auto'
              target.style.height = `${Math.min(target.scrollHeight, 120)}px`
            }}
          />
          {isSending ? (
            <Button
              variant='ghost'
              size='sm'
              onClick={() => {
                abortControllerRef.current?.abort()
                setIsSending(false)
              }}
              className='h-[38px] w-[38px] flex-shrink-0 p-0'
            >
              <Square className='h-4 w-4' />
            </Button>
          ) : (
            <Button
              variant='ghost'
              size='sm'
              onClick={handleSubmit}
              disabled={!inputValue.trim()}
              className='h-[38px] w-[38px] flex-shrink-0 p-0'
            >
              <Send className='h-4 w-4' />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
