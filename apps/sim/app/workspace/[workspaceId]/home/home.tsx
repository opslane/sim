'use client'

import { useCallback, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { MOTHERSHIP_CHAT_API_PATH } from '@/lib/copilot/constants'
import { MessageContent, UserInput } from './components'
import { useChat } from './hooks'

interface HomeProps {
  chatId?: string
  streamId?: string
}

export function Home({ chatId, streamId }: HomeProps = {}) {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const router = useRouter()
  const [inputValue, setInputValue] = useState('')
  const { messages, isSending, currentChatId, sendMessage, stopGeneration, chatBottomRef } =
    useChat(workspaceId, chatId, streamId)

  const handleSubmit = useCallback(async () => {
    const trimmed = inputValue.trim()
    if (!trimmed) return
    setInputValue('')

    if (chatId || currentChatId) {
      sendMessage(trimmed)
      return
    }

    const userMessageId = crypto.randomUUID()

    try {
      const response = await fetch(MOTHERSHIP_CHAT_API_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          workspaceId,
          userMessageId,
          createNewChat: true,
        }),
      })

      if (!response.ok) throw new Error('Failed to start task')
      response.body?.cancel()
      router.push(
        `/workspace/${workspaceId}/task/new?sid=${userMessageId}&m=${encodeURIComponent(trimmed)}`
      )
    } catch {
      setInputValue(trimmed)
    }
  }, [inputValue, chatId, currentChatId, sendMessage, workspaceId, router])

  const hasMessages = messages.length > 0

  if (!hasMessages) {
    return (
      <div className='flex h-full flex-col items-center justify-center bg-[#FCFCFC] px-[24px] dark:bg-[var(--surface-1)]'>
        <h1 className='mb-[24px] font-[450] font-season text-[32px] text-[var(--text-primary)] tracking-[-0.02em]'>
          What do you want to do?
        </h1>
        <UserInput
          value={inputValue}
          onChange={setInputValue}
          onSubmit={handleSubmit}
          isSending={isSending}
          onStopGeneration={stopGeneration}
        />
      </div>
    )
  }

  return (
    <div className='flex h-full bg-[#FCFCFC] dark:bg-[var(--surface-1)]'>
      <div className='flex h-full min-w-0 flex-1 flex-col'>
        <div className='min-h-0 flex-1 overflow-y-auto px-[16px] py-[16px]'>
          <div className='mx-auto max-w-[768px] space-y-[16px]'>
            {messages.map((msg) => {
              if (msg.role === 'user') {
                return (
                  <div key={msg.id} className='flex justify-end'>
                    <div className='max-w-[80%] rounded-[12px] bg-[var(--surface-5)] px-[10px] py-[8px] text-[14px] text-[var(--text-primary)]'>
                      <p className='whitespace-pre-wrap'>{msg.content}</p>
                    </div>
                  </div>
                )
              }

              const hasBlocks = msg.contentBlocks && msg.contentBlocks.length > 0
              const isThisStreaming = isSending && msg === messages[messages.length - 1]

              if (!hasBlocks && !msg.content && isThisStreaming) {
                return (
                  <div
                    key={msg.id}
                    className='flex items-center gap-[8px] py-[8px] text-[13px] text-[var(--text-tertiary)]'
                  >
                    <Loader2 className='h-[14px] w-[14px] animate-spin' />
                    Thinking...
                  </div>
                )
              }

              if (!hasBlocks && !msg.content) return null

              return (
                <div key={msg.id} className='text-[14px] text-[var(--text-primary)]'>
                  <MessageContent
                    blocks={msg.contentBlocks || []}
                    fallbackContent={msg.content}
                    isStreaming={isThisStreaming}
                  />
                </div>
              )
            })}
            <div ref={chatBottomRef} />
          </div>
        </div>

        <div className='flex-shrink-0 border-[var(--border)] border-t px-[24px] py-[16px]'>
          <UserInput
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleSubmit}
            isSending={isSending}
            onStopGeneration={stopGeneration}
            animate={false}
          />
        </div>
      </div>

      <div className='hidden h-full w-[480px] flex-shrink-0 flex-col border-[var(--border)] border-l lg:flex'>
        <div className='flex items-center border-[var(--border)] border-b px-[16px] py-[12px]'>
          <span className='font-medium text-[13px] text-[var(--text-secondary)]'>Artifacts</span>
        </div>
        <div className='flex flex-1 items-center justify-center'>
          <span className='text-[13px] text-[var(--text-muted)]'>No artifacts yet</span>
        </div>
      </div>
    </div>
  )
}
