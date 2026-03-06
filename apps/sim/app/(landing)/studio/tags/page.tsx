import Link from 'next/link'
import { getAllTags } from '@/lib/blog/registry'

export default async function TagsIndex() {
  const tags = await getAllTags()
  return (
    <main className='mx-auto max-w-[900px] px-6 py-10 sm:px-8 md:px-12'>
      <h1 className='mb-6 font-season font-[430] text-[32px] text-white leading-tight tracking-[-0.02em]'>Browse by tag</h1>
      <div className='flex flex-wrap gap-3'>
        <Link href='/studio' className='rounded-full border border-[#2A2A2A] bg-[rgba(246,246,240,0.06)] px-3 py-1 font-season font-[430] text-[14px] text-[#F6F6F6] transition-all hover:bg-[rgba(246,246,240,0.1)]'>
          All
        </Link>
        {tags.map((t) => (
          <Link
            key={t.tag}
            href={`/studio?tag=${encodeURIComponent(t.tag)}`}
            className='rounded-full border border-[#2A2A2A] bg-[rgba(246,246,240,0.06)] px-3 py-1 font-season font-[430] text-[14px] text-[#F6F6F6] transition-all hover:bg-[rgba(246,246,240,0.1)]'
          >
            {t.tag} ({t.count})
          </Link>
        ))}
      </div>
    </main>
  )
}
