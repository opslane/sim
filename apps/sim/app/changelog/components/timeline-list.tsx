'use client'

import React from 'react'
import ReactMarkdown from 'react-markdown'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/emcn'
import { inter } from '@/app/_styles/fonts/inter/inter'
import type { ChangelogEntry } from '@/app/changelog/components/changelog-content'

interface ChangelogListProps {
  initialEntries: ChangelogEntry[]
  onEntriesChange?: (entries: ChangelogEntry[]) => void
  onActiveEntryChange?: (activeTag: string | null) => void
  onProgressChange?: (progress: number) => void
  variant?: 'cards' | 'flat' | 'timeline'
  /** When set, paginate client-side instead of fetching from API. */
  pageSize?: number
}

function DotSeparator() {
  return (
    <div
      aria-hidden='true'
      className='border-[#2A2A2A] border-y bg-[#1C1C1C] p-[6px]'
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(60, 1fr)',
        gap: '6px',
        placeItems: 'center',
      }}
    >
      {Array.from({ length: 60 }, (_, i) => (
        <div key={i} className='h-[2px] w-[2px] rounded-full bg-[#2A2A2A]' />
      ))}
    </div>
  )
}

function sanitizeContent(body: string): string {
  return body.replace(/&nbsp/g, '')
}

function stripContributors(body: string): string {
  let output = body
  output = output.replace(
    /(^|\n)#{1,6}\s*(New\s+)?Contributors\b[^\n]*\n[\s\S]*?(?=\n\s*\n|\n#{1,6}\s|$)/gi,
    '\n'
  )
  output = output.replace(
    /(^|\n)\s*(?:\*\*|__)?\s*Contributors\s*(?:\*\*|__)?\s*:?\s*\n[\s\S]*?(?=\n\s*\n|\n#{1,6}\s|$)/gi,
    '\n'
  )
  output = output.replace(
    /(^|\n)[-*+]\s*(?:@[A-Za-z0-9-]+(?:\s*,\s*|\s+))+@[A-Za-z0-9-]+\s*(?=\n)/g,
    '\n'
  )
  output = output.replace(
    /(^|\n)\s*(?:@[A-Za-z0-9-]+(?:\s*,\s*|\s+))+@[A-Za-z0-9-]+\s*(?=\n)/g,
    '\n'
  )
  return output
}

function isContributorsLabel(nodeChildren: React.ReactNode): boolean {
  return /^\s*contributors\s*:?\s*$/i.test(String(nodeChildren))
}

function stripPrReferences(body: string): string {
  return body.replace(/\s*\(\s*\[#\d+\]\([^)]*\)\s*\)/g, '').replace(/\s*\(\s*#\d+\s*\)/g, '')
}

function stripChangelogFooter(body: string): string {
  return body
    .split('\n')
    .filter((line) => {
      const t = line.trim()
      if (t.startsWith('**Full Changelog**')) return false
      if (/^\[Full Changelog\]/i.test(t)) return false
      if (/^View (all )?changes? on GitHub/i.test(t)) return false
      if (/^\[View (all )?changes? on GitHub\]/i.test(t)) return false
      if (t === '[') return false
      return true
    })
    .join('\n')
    .trimEnd()
}

function cleanMarkdown(body: string): string {
  const sanitized = sanitizeContent(body)
  const withoutContribs = stripContributors(sanitized)
  const withoutPrs = stripPrReferences(withoutContribs)
  const withoutFooter = stripChangelogFooter(withoutPrs)
  return withoutFooter
}

function extractMentions(body: string): string[] {
  const matches = body.match(/@([A-Za-z0-9-]+)/g) ?? []
  return Array.from(new Set(matches.map((m) => m.slice(1))))
}

/** Dot grid pattern matching Figma card header background */
const dotGridStyle: React.CSSProperties = {
  backgroundImage: 'radial-gradient(circle, #2e2e2e 1px, transparent 1px)',
  backgroundSize: '10px 10px',
}

export default function ChangelogList({
  initialEntries,
  onEntriesChange,
  onActiveEntryChange,
  onProgressChange,
  variant = 'cards',
  pageSize,
}: ChangelogListProps) {
  const [entries, setEntries] = React.useState<ChangelogEntry[]>(initialEntries)
  const [page, setPage] = React.useState<number>(1)
  const [loading, setLoading] = React.useState<boolean>(false)
  const [done, setDone] = React.useState<boolean>(!!pageSize)
  const [visibleCount, setVisibleCount] = React.useState<number>(
    pageSize ?? initialEntries.length
  )
  const [activeTag, setActiveTag] = React.useState<string | null>(initialEntries[0]?.tag ?? null)
  const shouldTrackActiveEntry = Boolean(onActiveEntryChange)
  const cardRefs = React.useRef<Array<HTMLDivElement | null>>([])
  const containerRef = React.useRef<HTMLDivElement>(null)

  const displayedEntries = pageSize ? entries.slice(0, visibleCount) : entries
  const allRevealed = visibleCount >= entries.length

  React.useEffect(() => {
    onEntriesChange?.(entries)
  }, [entries, onEntriesChange])

  React.useEffect(() => {
    if (!shouldTrackActiveEntry) return
    onActiveEntryChange?.(activeTag)
  }, [activeTag, onActiveEntryChange, shouldTrackActiveEntry])

  React.useEffect(() => {
    if (!shouldTrackActiveEntry) return
    if (!displayedEntries.length) {
      setActiveTag(null)
      return
    }

    const halfVisible = new Set<number>()

    const observer = new IntersectionObserver(
      (observerEntries) => {
        for (const observerEntry of observerEntries) {
          const element = observerEntry.target as HTMLDivElement
          const index = Number(element.dataset.entryIndex)
          if (Number.isNaN(index)) continue

          if (observerEntry.isIntersecting && observerEntry.intersectionRatio >= 0.5) {
            halfVisible.add(index)
          } else {
            halfVisible.delete(index)
          }
        }

        if (halfVisible.size === 0) return

        const targetIdx = Math.min(...halfVisible)
        const tag = displayedEntries[targetIdx]?.tag ?? null
        setActiveTag((prev) => (prev === tag ? prev : tag))

        if (onProgressChange) {
          const total = Math.max(1, displayedEntries.length - 1)
          onProgressChange(targetIdx / total)
        }
      },
      {
        root: null,
        threshold: 0.5,
      }
    )

    for (let index = 0; index < displayedEntries.length; index += 1) {
      const card = cardRefs.current[index]
      if (!card) continue
      observer.observe(card)
    }

    return () => {
      observer.disconnect()
      halfVisible.clear()
    }
  }, [displayedEntries, shouldTrackActiveEntry, variant])

  const handleShowMore = () => {
    if (pageSize) {
      setVisibleCount((c) => Math.min(c + pageSize, entries.length))
      return
    }
    loadMore()
  }

  const loadMore = async () => {
    if (loading || done) return
    setLoading(true)
    try {
      const nextPage = page + 1
      const res = await fetch(
        `https://api.github.com/repos/simstudioai/sim/releases?per_page=10&page=${nextPage}`,
        { headers: { Accept: 'application/vnd.github+json' } }
      )
      const releases: any[] = await res.json()
      const mapped: ChangelogEntry[] = (releases || [])
        .filter((r) => !r.prerelease)
        .map((r) => ({
          tag: r.tag_name,
          title: r.name || r.tag_name,
          content: sanitizeContent(String(r.body || '')),
          date: r.published_at,
          url: r.html_url,
          contributors: extractMentions(String(r.body || '')),
        }))

      if (mapped.length === 0) {
        setDone(true)
      } else {
        setEntries((prev) => [...prev, ...mapped])
        setPage(nextPage)
      }
    } catch {
      setDone(true)
    } finally {
      setLoading(false)
    }
  }

  const markdownComponents = {
    h2: ({ children, ...props }: any) =>
      isContributorsLabel(children) ? null : (
        <h3
          className='mt-5 mb-2 font-season font-[430] text-[13px] text-[#F6F6F6] tracking-[-0.02em] [&:first-child]:mt-0'
          {...props}
        >
          {children}
        </h3>
      ),
    h3: ({ children, ...props }: any) =>
      isContributorsLabel(children) ? null : (
        <h4
          className='mt-4 mb-1 font-season font-[430] text-[13px] text-[#F6F6F6] tracking-[-0.02em] [&:first-child]:mt-0'
          {...props}
        >
          {children}
        </h4>
      ),
    ul: ({ children, ...props }: any) => (
      <ul className='mt-2 mb-3 space-y-1.5' {...props}>
        {children}
      </ul>
    ),
    li: ({ children, ...props }: any) => {
      const text = String(children)
      if (/^\s*contributors\s*:?\s*$/i.test(text)) return null
      return (
        <li
          className='font-season font-normal text-[13px] text-[#F6F6F0]/50 leading-[125%] tracking-[0.02em]'
          {...props}
        >
          {children}
        </li>
      )
    },
    p: ({ children, ...props }: any) =>
      /^\s*contributors\s*:?\s*$/i.test(String(children)) ? null : (
        <p
          className='mb-3 font-season font-normal text-[13px] text-[#F6F6F0]/50 leading-[125%] tracking-[0.02em]'
          {...props}
        >
          {children}
        </p>
      ),
    strong: ({ children, ...props }: any) => (
      <strong className='font-medium text-[#F6F6F6]' {...props}>
        {children}
      </strong>
    ),
    code: ({ children, ...props }: any) => (
      <code
        className='rounded bg-[#2A2A2A] px-1 py-0.5 font-mono text-[#F6F6F6] text-xs'
        {...props}
      >
        {children}
      </code>
    ),
    pre: ({ children, ...props }: any) => (
      <pre {...props} suppressHydrationWarning>
        {children}
      </pre>
    ),
    img: () => null,
    a: ({ className, ...props }: any) => (
      <a
        {...props}
        className={`underline ${className ?? ''}`}
        target='_blank'
        rel='noreferrer'
      />
    ),
  }

  return (
    <div
      ref={containerRef}
      className={
        variant === 'flat'
          ? 'flex flex-col'
          : variant === 'timeline'
            ? 'relative flex flex-col'
            : 'flex flex-col gap-4'
      }
    >
      {displayedEntries.map((entry, index) => {
        const setRef = (element: HTMLDivElement | null) => {
          cardRefs.current[index] = element
        }

        if (variant === 'timeline') {
          return (
            <React.Fragment key={entry.tag}>
              {index > 0 && (
                <div className='relative left-1/2 w-[100vw] -translate-x-1/2 md:w-[50vw]'>
                  <DotSeparator />
                </div>
              )}
              <div
                ref={setRef}
                data-entry-index={index}
                data-tag={entry.tag}
                className='py-8'
              >
              <div className='mb-5 flex items-center justify-between gap-4'>
                <div className='flex items-center gap-3'>
                  <a
                    href={entry.url}
                    target='_blank'
                    rel='noreferrer noopener'
                    className='group/tag font-season font-[600] text-[#fdfdf8] text-xl tracking-[-0.02em]'
                  >
                    <span className='relative'>
                      {entry.tag}
                      <span className='absolute bottom-0 left-0 h-[1px] w-0 bg-[#fdfdf8] transition-[width] duration-200 group-hover/tag:w-full' />
                    </span>
                  </a>
                  {entry.contributors && entry.contributors.length > 0 && (
                    <div className='-space-x-2 flex'>
                      {entry.contributors.slice(0, 5).map((contributor) => (
                        <a
                          key={contributor}
                          href={`https://github.com/${contributor}`}
                          target='_blank'
                          rel='noreferrer noopener'
                          aria-label={`View @${contributor} on GitHub`}
                          title={`@${contributor}`}
                          className='block'
                        >
                          <Avatar className='size-6 ring-2 ring-[#1C1C1C]'>
                            <AvatarImage
                              src={`https://avatars.githubusercontent.com/${contributor}`}
                              alt={`@${contributor}`}
                              className='hover:z-10'
                            />
                            <AvatarFallback className='bg-[#2a2a2a] text-[#F6F6F6] text-[10px]'>
                              {contributor.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                        </a>
                      ))}
                      {entry.contributors.length > 5 && (
                        <div className='relative flex size-6 items-center justify-center rounded-full bg-[#2A2A2A] text-[10px] text-[#F6F6F6] ring-2 ring-[#1C1C1C] hover:z-10'>
                          +{entry.contributors.length - 5}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className={`${inter.className} shrink-0 text-[#F6F6F6]/50 text-xs`}>
                  {new Date(entry.date).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </div>
              </div>
              <div className='prose prose-sm prose-invert max-w-none prose-a:text-brand-primary prose-a:no-underline hover:prose-a:underline'>
                <ReactMarkdown components={markdownComponents}>
                  {cleanMarkdown(entry.content)}
                </ReactMarkdown>
              </div>
              </div>
            </React.Fragment>
          )
        }

        if (variant === 'flat') {
          return (
            <React.Fragment key={entry.tag}>
              {index > 0 && <DotSeparator />}
              <div ref={setRef} data-entry-index={index} data-tag={entry.tag} className='py-8'>
                <div className='mb-5 flex items-center justify-between gap-4'>
                  <div className='flex items-center gap-3'>
                    <a
                      href={entry.url}
                      target='_blank'
                      rel='noreferrer noopener'
                      className='group/tag font-season font-[600] text-[#fdfdf8] text-xl tracking-[-0.02em]'
                    >
                      <span className='relative'>
                        {entry.tag}
                        <span className='absolute bottom-0 left-0 h-[1px] w-0 bg-[#fdfdf8] transition-[width] duration-200 group-hover/tag:w-full' />
                      </span>
                    </a>
                    {entry.contributors && entry.contributors.length > 0 && (
                      <div className='-space-x-2 flex'>
                        {entry.contributors.slice(0, 5).map((contributor) => (
                          <a
                            key={contributor}
                            href={`https://github.com/${contributor}`}
                            target='_blank'
                            rel='noreferrer noopener'
                            aria-label={`View @${contributor} on GitHub`}
                            title={`@${contributor}`}
                            className='block'
                          >
                            <Avatar className='size-6 ring-2 ring-[#1C1C1C]'>
                              <AvatarImage
                                src={`https://avatars.githubusercontent.com/${contributor}`}
                                alt={`@${contributor}`}
                                className='hover:z-10'
                              />
                              <AvatarFallback className='bg-[#2a2a2a] text-[#F6F6F6] text-[10px]'>
                                {contributor.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                          </a>
                        ))}
                        {entry.contributors.length > 5 && (
                          <div className='relative flex size-6 items-center justify-center rounded-full bg-[#2A2A2A] text-[10px] text-[#F6F6F6] ring-2 ring-[#1C1C1C] hover:z-10'>
                            +{entry.contributors.length - 5}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className={`${inter.className} shrink-0 text-[#F6F6F6]/50 text-xs`}>
                    {new Date(entry.date).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </div>
                </div>
                <div className='prose prose-sm prose-invert max-w-none prose-a:text-brand-primary prose-a:no-underline hover:prose-a:underline'>
                  <ReactMarkdown components={markdownComponents}>
                    {cleanMarkdown(entry.content)}
                  </ReactMarkdown>
                </div>
              </div>
            </React.Fragment>
          )
        }

        return (
          <div
            key={entry.tag}
            ref={setRef}
            data-entry-index={index}
            data-tag={entry.tag}
            className='overflow-hidden rounded-[14px] border border-[#4d4d4d] bg-[#1b1b1b]'
          >
            {/* Card header with dot grid pattern */}
            <div
              className='relative flex items-center justify-between gap-4 border-b border-[#2a2a2a] px-5 py-4'
              style={dotGridStyle}
            >
              <div className='flex items-center gap-3'>
                <a
                  href={entry.url}
                  target='_blank'
                  rel='noreferrer noopener'
                  className='group/tag font-season font-[600] text-[#fdfdf8] text-xl tracking-[-0.02em]'
                >
                  <span className='relative'>
                    {entry.tag}
                    <span className='absolute bottom-0 left-0 h-[1px] w-0 bg-[#fdfdf8] transition-[width] duration-200 group-hover/tag:w-full' />
                  </span>
                </a>
                {entry.contributors && entry.contributors.length > 0 && (
                  <div className='-space-x-2 flex'>
                    {entry.contributors.slice(0, 5).map((contributor) => (
                      <a
                        key={contributor}
                        href={`https://github.com/${contributor}`}
                        target='_blank'
                        rel='noreferrer noopener'
                        aria-label={`View @${contributor} on GitHub`}
                        title={`@${contributor}`}
                        className='block'
                      >
                        <Avatar className='size-6 ring-2 ring-[#1C1C1C]'>
                          <AvatarImage
                            src={`https://avatars.githubusercontent.com/${contributor}`}
                            alt={`@${contributor}`}
                            className='hover:z-10'
                          />
                          <AvatarFallback className='bg-[#2a2a2a] text-[#F6F6F6] text-[10px]'>
                            {contributor.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      </a>
                    ))}
                    {entry.contributors.length > 5 && (
                      <div className='relative flex size-6 items-center justify-center rounded-full bg-[#2A2A2A] text-[10px] text-[#F6F6F6] ring-2 ring-[#1C1C1C] hover:z-10'>
                        +{entry.contributors.length - 5}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className={`${inter.className} text-[#F6F6F6]/50 text-xs`}>
                {new Date(entry.date).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </div>
            </div>

            {/* Card body */}
            <div className='px-5 py-4'>
              <div className='prose prose-sm prose-invert max-w-none prose-a:text-brand-primary prose-a:no-underline hover:prose-a:underline'>
                <ReactMarkdown components={markdownComponents}>
                  {cleanMarkdown(entry.content)}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        )
      })}

      {!(pageSize ? allRevealed : done) && (
        <div>
          <button
            type='button'
            onClick={handleShowMore}
            disabled={loading}
            className='rounded-[5px] border border-[#2A2A2A] bg-[rgba(246,246,240,0.06)] px-3 py-1.5 text-[13px] text-[#F6F6F6] hover:bg-[rgba(246,246,240,0.1)] disabled:opacity-60'
          >
            {loading ? 'Loading…' : 'Show more'}
          </button>
        </div>
      )}
    </div>
  )
}
