'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { cn } from '@/lib/core/utils/cn'

interface Author {
  id: string
  name: string
  avatarUrl?: string
  url?: string
}

interface Post {
  slug: string
  title: string
  description: string
  date: string
  ogImage: string
  author: Author
  authors?: Author[]
  featured?: boolean
}

const INITIAL_VISIBLE = 9

export function PostGrid({ posts }: { posts: Post[] }) {
  const [showAll, setShowAll] = useState(false)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const visiblePosts = showAll ? posts : posts.slice(0, INITIAL_VISIBLE)
  const hasMore = posts.length > INITIAL_VISIBLE

  return (
    <div className='flex flex-col gap-10'>
      <div
        className='grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-10 lg:grid-cols-3'
        onMouseLeave={() => setHoveredIndex(null)}
      >
        {visiblePosts.map((p, index) => {
          const authors = p.authors && p.authors.length > 0 ? p.authors : [p.author]
          const authorNames = authors.map((a) => a?.name).join(', ')
          const isHovered = hoveredIndex === index
          const isDimmed = hoveredIndex !== null && !isHovered

          return (
            <Link
              key={p.slug}
              href={`/studio/${p.slug}`}
              className={cn(
                'group flex flex-col overflow-hidden rounded-[10px] border border-[#2A2A2A] transition-[background-color] duration-200',
                isDimmed ? 'bg-transparent' : 'bg-[#222222] hover:border-[#3A3A3A]'
              )}
              onMouseEnter={() => setHoveredIndex(index)}
            >
              <div className='relative aspect-video w-full overflow-hidden bg-[#1C1C1C]'>
                <Image
                  src={p.ogImage}
                  alt={p.title}
                  sizes='(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw'
                  unoptimized
                  priority={index < 6}
                  loading={index < 6 ? undefined : 'lazy'}
                  fill
                  style={{ objectFit: 'cover' }}
                />
              </div>
              <div className='flex flex-1 flex-col gap-2 p-4'>
                <h3 className='font-season font-[430] text-[17px] text-white leading-snug'>
                  {p.title}
                </h3>
                <span className='font-season font-[430] text-[12px] text-[#F6F6F0]/50'>
                  {new Date(p.date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                  <span className='mx-2'>•</span>
                  {authorNames}
                </span>
              </div>
            </Link>
          )
        })}
      </div>

      {hasMore && !showAll && (
        <div className='flex justify-center'>
          <button
            type='button'
            onClick={() => setShowAll(true)}
            className='rounded-[5px] border border-[#2A2A2A] bg-[rgba(246,246,240,0.06)] px-4 py-2 font-season font-[430] text-[14px] text-[#F6F6F6] transition-all hover:bg-[rgba(246,246,240,0.1)]'
          >
            Show more
          </button>
        </div>
      )}
    </div>
  )
}
