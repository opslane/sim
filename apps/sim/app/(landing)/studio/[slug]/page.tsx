import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/emcn'
import { FAQ } from '@/lib/blog/faq'
import { getAllPostMeta, getPostBySlug, getRelatedPosts } from '@/lib/blog/registry'
import { buildArticleJsonLd, buildBreadcrumbJsonLd, buildPostMetadata } from '@/lib/blog/seo'
import { getBaseUrl } from '@/lib/core/utils/urls'
import { BackLink } from '@/app/(landing)/studio/[slug]/back-link'
import { ShareButton } from '@/app/(landing)/studio/[slug]/share-button'

export async function generateStaticParams() {
  const posts = await getAllPostMeta()
  return posts.map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const post = await getPostBySlug(slug)
  return buildPostMetadata(post)
}

export const revalidate = 86400

const PROSE_CLASSES = [
  'prose prose-lg prose-invert max-w-none',
  'prose-headings:font-season prose-headings:font-[430] prose-headings:text-white prose-headings:tracking-[-0.02em]',
  'prose-p:text-[#F6F6F0]/80',
  'prose-a:text-[#33C482] prose-a:no-underline hover:prose-a:text-[#33C482]/80',
  'prose-strong:text-white',
  'prose-blockquote:border-[#2A2A2A] prose-blockquote:text-[#F6F6F0]/60',
  'prose-hr:border-[#2A2A2A]',
  'prose-li:text-[#F6F6F0]/80',
  'prose-img:rounded-[10px] prose-img:border prose-img:border-[#2A2A2A]',
  '[&_code]:!bg-[#2A2A2A] [&_code]:!text-[#F6F6F0]/90 [&_code]:rounded [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.875em]',
  '[&_pre]:!bg-[#222222] [&_pre]:border [&_pre]:border-[#2A2A2A] [&_pre]:rounded-[10px]',
  '[&_pre_code]:!bg-transparent [&_pre_code]:p-0',
].join(' ')

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await getPostBySlug(slug)
  const Article = post.Content
  const jsonLd = buildArticleJsonLd(post)
  const breadcrumbLd = buildBreadcrumbJsonLd(post)
  const related = await getRelatedPosts(slug, 3)

  return (
    <article
      className='w-full'
      itemScope
      itemType='https://schema.org/BlogPosting'
    >
      <script
        type='application/ld+json'
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type='application/ld+json'
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <header className='mx-auto max-w-[1000px] px-6 pt-8 sm:px-8 sm:pt-12 md:px-12 md:pt-16'>
        <div className='mb-6'>
          <BackLink />
        </div>
        <div className='flex flex-col'>
          <h1
            className='font-season font-[430] text-[36px] text-white leading-tight tracking-[-0.02em] sm:text-[48px] md:text-[56px] lg:text-[64px]'
            itemProp='headline'
          >
            {post.title}
          </h1>
          <p className='mt-4 font-season font-[430] text-[16px] text-[#F6F6F0]/80 leading-[1.5] sm:text-[18px] md:text-[22px]'>
            {post.description}
          </p>
          <div className='mt-6 flex items-center justify-between'>
            <div className='flex items-center gap-3'>
              <time
                className='font-season font-[430] text-[14px] text-[#F6F6F0]/50 leading-[1.5] sm:text-[16px]'
                dateTime={post.date}
                itemProp='datePublished'
              >
                {new Date(post.date).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </time>
              <meta itemProp='dateModified' content={post.updated ?? post.date} />
              <span className='text-[#F6F6F0]/30'>·</span>
              {(post.authors || [post.author]).map((a, idx) => (
                <div key={idx} className='flex items-center gap-2'>
                  {a?.avatarUrl ? (
                    <Avatar className='size-6'>
                      <AvatarImage src={a.avatarUrl} alt={a.name} />
                      <AvatarFallback>{a.name.slice(0, 2)}</AvatarFallback>
                    </Avatar>
                  ) : null}
                  <Link
                    href={a?.url || '#'}
                    target='_blank'
                    rel='noopener noreferrer author'
                    className='font-season font-[430] text-[14px] text-[#F6F6F0]/50 leading-[1.5] hover:text-[#F6F6F0]/80 sm:text-[16px]'
                    itemProp='author'
                    itemScope
                    itemType='https://schema.org/Person'
                  >
                    <span itemProp='name'>{a?.name}</span>
                  </Link>
                </div>
              ))}
            </div>
            <ShareButton url={`${getBaseUrl()}/studio/${slug}`} title={post.title} />
          </div>
        </div>
        <hr className='mt-8 border-[#2A2A2A] border-t sm:mt-12' />
      </header>

      <div className='mx-auto max-w-[900px] px-6 py-10 pb-20 sm:px-8 md:px-12' itemProp='articleBody'>
        <div className={PROSE_CLASSES}>
          <Article />
          {post.faq && post.faq.length > 0 ? <FAQ items={post.faq} /> : null}
        </div>
      </div>
      {related.length > 0 && (
        <div className='mx-auto max-w-[900px] px-6 pb-24 sm:px-8 md:px-12'>
          <h2 className='mb-4 font-season font-[430] text-[24px] text-white tracking-[-0.02em]'>Related posts</h2>
          <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3'>
            {related.map((p) => (
              <Link key={p.slug} href={`/studio/${p.slug}`} className='group'>
                <div className='overflow-hidden rounded-[10px] border border-[#2A2A2A] bg-[#222222] transition-all hover:border-[#3A3A3A]'>
                  <Image
                    src={p.ogImage}
                    alt={p.title}
                    width={600}
                    height={315}
                    className='h-[160px] w-full object-cover'
                    sizes='(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw'
                    loading='lazy'
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
        </div>
      )}
      <meta itemProp='publisher' content='Sim' />
      <meta itemProp='inLanguage' content='en-US' />
      <meta itemProp='keywords' content={post.tags.join(', ')} />
    </article>
  )
}
