import Link from 'next/link'
import { getAllPostMeta } from '@/lib/blog/registry'
import { PostGrid } from '@/app/(landing)/studio/post-grid'

export const revalidate = 3600

export default async function StudioIndex({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; tag?: string }>
}) {
  const { page, tag } = await searchParams
  const pageNum = Math.max(1, Number(page || 1))
  const perPage = 20

  const all = await getAllPostMeta()
  const filtered = tag ? all.filter((p) => p.tags.includes(tag)) : all

  const sorted =
    pageNum === 1
      ? filtered.sort((a, b) => {
          if (a.featured && !b.featured) return -1
          if (!a.featured && b.featured) return 1
          return new Date(b.date).getTime() - new Date(a.date).getTime()
        })
      : filtered

  const totalPages = Math.max(1, Math.ceil(sorted.length / perPage))
  const start = (pageNum - 1) * perPage
  const posts = sorted.slice(start, start + perPage)

  const studioJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'Sim Studio',
    url: 'https://sim.ai/studio',
    description: 'Announcements, insights, and guides for building AI agent workflows.',
  }

  return (
    <div className='relative min-h-screen overflow-hidden'>
      <script
        type='application/ld+json'
        dangerouslySetInnerHTML={{ __html: JSON.stringify(studioJsonLd) }}
      />

      <main className='relative z-10 mx-auto max-w-[1400px] px-4 py-16 sm:px-6 md:px-8 md:py-24'>
        <h1 className='mt-6 font-season font-[430] text-4xl text-white tracking-[-0.02em] sm:text-5xl'>
          Sim Studio
        </h1>
        <p className='mt-3 font-season font-[430] text-[#F6F6F0]/50 text-[14px] leading-[125%] tracking-[0.02em] sm:text-[16px]'>
          Announcements, insights, and guides for building AI agent workflows.
        </p>

        <div className='mt-10'>
          <PostGrid posts={posts} />
        </div>

        {totalPages > 1 && (
          <div className='mt-10 flex items-center justify-center gap-3'>
            {pageNum > 1 && (
              <Link
                href={`/studio?page=${pageNum - 1}${tag ? `&tag=${encodeURIComponent(tag)}` : ''}`}
                className='rounded-[5px] border border-[#2A2A2A] bg-[rgba(246,246,240,0.06)] px-3 py-1 font-season font-[430] text-[14px] text-[#F6F6F6] transition-all hover:bg-[rgba(246,246,240,0.1)]'
              >
                Previous
              </Link>
            )}
            <span className='font-season font-[430] text-[#F6F6F0]/50 text-[14px]'>
              Page {pageNum} of {totalPages}
            </span>
            {pageNum < totalPages && (
              <Link
                href={`/studio?page=${pageNum + 1}${tag ? `&tag=${encodeURIComponent(tag)}` : ''}`}
                className='rounded-[5px] border border-[#2A2A2A] bg-[rgba(246,246,240,0.06)] px-3 py-1 font-season font-[430] text-[14px] text-[#F6F6F6] transition-all hover:bg-[rgba(246,246,240,0.1)]'
              >
                Next
              </Link>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
