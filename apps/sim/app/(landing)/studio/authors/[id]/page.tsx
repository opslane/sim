import Image from 'next/image'
import Link from 'next/link'
import { getAllPostMeta } from '@/lib/blog/registry'

export const revalidate = 3600

export default async function AuthorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const posts = (await getAllPostMeta()).filter((p) => p.author.id === id)
  const author = posts[0]?.author
  if (!author) {
    return (
      <main className='mx-auto max-w-[900px] px-6 py-10 sm:px-8 md:px-12'>
        <h1 className='font-season font-[430] text-[32px] text-white tracking-[-0.02em]'>Author not found</h1>
      </main>
    )
  }
  const personJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: author.name,
    url: `https://sim.ai/studio/authors/${author.id}`,
    sameAs: author.url ? [author.url] : [],
    image: author.avatarUrl,
  }
  return (
    <main className='mx-auto max-w-[900px] px-6 py-10 sm:px-8 md:px-12'>
      <script
        type='application/ld+json'
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personJsonLd) }}
      />
      <div className='mb-6 flex items-center gap-3'>
        {author.avatarUrl ? (
          <Image
            src={author.avatarUrl}
            alt={author.name}
            width={40}
            height={40}
            className='rounded-full'
            unoptimized
          />
        ) : null}
        <h1 className='font-season font-[430] text-[32px] text-white leading-tight tracking-[-0.02em]'>{author.name}</h1>
      </div>
      <div className='grid grid-cols-1 gap-8 sm:grid-cols-2'>
        {posts.map((p) => (
          <Link key={p.slug} href={`/studio/${p.slug}`} className='group'>
            <div className='overflow-hidden rounded-[10px] border border-[#2A2A2A] bg-[#222222] transition-all hover:border-[#3A3A3A]'>
              <Image
                src={p.ogImage}
                alt={p.title}
                width={600}
                height={315}
                className='h-[160px] w-full object-cover transition-transform group-hover:scale-[1.02]'
                unoptimized
              />
              <div className='p-3'>
                <div className='mb-1 font-season font-[430] text-[#F6F6F0]/50 text-xs'>
                  {new Date(p.date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </div>
                <div className='font-season font-[430] text-white text-sm leading-tight'>{p.title}</div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </main>
  )
}
