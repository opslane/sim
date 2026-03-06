import Navbar from '@/app/(home)/components/navbar/navbar'
import { Footer } from '@/app/(landing)/components'
import { martianMono } from '@/app/_styles/fonts/martian-mono/martian-mono'
import { season } from '@/app/_styles/fonts/season/season'

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  const orgJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Sim',
    url: 'https://sim.ai',
    logo: 'https://sim.ai/logo/primary/small.png',
    sameAs: ['https://x.com/simdotai'],
  }

  const websiteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Sim',
    url: 'https://sim.ai',
    potentialAction: {
      '@type': 'SearchAction',
      target: 'https://sim.ai/search?q={search_term_string}',
      'query-input': 'required name=search_term_string',
    },
  }

  return (
    <div className={`${season.variable} ${martianMono.variable} relative min-h-screen`}>
      <div className='-z-50 pointer-events-none fixed inset-0 bg-[#1C1C1C]' />
      <script
        type='application/ld+json'
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
      />
      <script
        type='application/ld+json'
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
      />
      <Navbar />
      <main className='relative flex-1'>{children}</main>
      <Footer fullWidth={true} />
    </div>
  )
}
