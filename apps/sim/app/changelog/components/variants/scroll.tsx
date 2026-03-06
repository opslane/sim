import { BookOpen, Github, Rss } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { ChangelogBlocks } from '@/app/changelog/components/changelog-blocks'
import type { ChangelogEntry } from '@/app/changelog/components/changelog-content'
import ChangelogList from '@/app/changelog/components/timeline-list'

interface ScrollProps {
  entries: ChangelogEntry[]
}

export function Scroll({ entries }: ScrollProps) {
  return (
    <div className='min-h-screen bg-[#1C1C1C]'>
      <div id='changelog-grid' className='relative grid md:grid-cols-2'>
        {/* Left intro panel */}
        <div className='relative top-0 overflow-hidden border-[#2A2A2A] border-b px-6 py-16 sm:px-10 md:sticky md:h-dvh md:border-r md:border-b-0 md:px-12 md:py-24'>
          {/* Background card decoration */}
          <div
            aria-hidden='true'
            className='pointer-events-none absolute top-[-0.7vw] left-[-2.8vw] z-0 aspect-[344/328] w-[23.9vw] opacity-40'
          >
            <Image src='/landing/card-left.svg' alt='' fill className='object-contain' />
          </div>

          {/* Union decorative shape */}
          <div
            aria-hidden='true'
            className='pointer-events-none absolute right-[-20%] bottom-[-10%] z-0 w-[75%] rotate-90 opacity-80'
          >
            <Image
              src='/landing/union-right.svg'
              alt=''
              width={768}
              height={768}
              className='h-auto w-full'
            />
          </div>

          <ChangelogBlocks mode='scroll' />

          <div className='relative z-10 mx-auto h-full max-w-xl md:flex md:flex-col md:justify-center'>
            <h1 className='mt-6 font-season font-[430] text-4xl text-white tracking-[-0.02em] sm:text-5xl'>
              Changelog
            </h1>
            <p className='mt-3 font-season font-[430] text-[#F6F6F0]/50 text-[14px] leading-[125%] tracking-[0.02em] sm:text-[16px]'>
              Stay up-to-date with the latest features, improvements, and bug fixes in Sim. All
              changes are documented here with detailed release notes.
            </p>

            <div className='mt-5 flex flex-wrap items-center gap-3'>
              <Link
                href='https://github.com/simstudioai/sim/releases'
                target='_blank'
                rel='noopener noreferrer'
                className='inline-flex h-[32px] items-center gap-[6px] rounded-[5px] border border-[#33C482] bg-[#33C482] px-[10px] font-season font-[430] text-[14px] text-black transition-[filter] hover:brightness-110'
              >
                <Github className='h-4 w-4' />
                View on GitHub
              </Link>
              <Link
                href='https://docs.sim.ai'
                className='inline-flex h-[32px] items-center gap-[6px] rounded-[5px] border border-[#2A2A2A] bg-[rgba(246,246,240,0.06)] px-[10px] font-season font-[430] text-[14px] text-[#F6F6F6] transition-all hover:bg-[rgba(246,246,240,0.1)]'
              >
                <BookOpen className='h-4 w-4' />
                Documentation
              </Link>
              <Link
                href='/changelog.xml'
                className='inline-flex h-[32px] items-center gap-[6px] rounded-[5px] border border-[#2A2A2A] bg-[rgba(246,246,240,0.06)] px-[10px] font-season font-[430] text-[14px] text-[#F6F6F6] transition-all hover:bg-[rgba(246,246,240,0.1)]'
              >
                <Rss className='h-4 w-4' />
                RSS Feed
              </Link>
            </div>
          </div>
        </div>

        {/* Right timeline */}
        <div className='relative px-4 py-10 sm:px-6 md:px-8 md:py-12'>
          <div className='relative max-w-2xl'>
            <ChangelogList initialEntries={entries} />
          </div>
        </div>
      </div>
    </div>
  )
}
