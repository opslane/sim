'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import Image from 'next/image'

/**
 * Static block pattern SVG rects matching the hero page's color palette.
 * These are arranged in a horizontal strip, similar to BlocksTopRightAnimated.
 */
const BLOCK_COLORS = ['#2ABBF8', '#00F701', '#FFCC02', '#FA4EDF'] as const
const RX = '2.59574'

/** Decorative background for the docs site (dark mode only).
 *  Renders card-left.svg, union-right.svg, and static block patterns. */
export function DocsBackground() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted || resolvedTheme !== 'dark') return null

  return (
    <div aria-hidden='true' className='pointer-events-none fixed inset-0 z-0 overflow-hidden'>
      {/* Card-left SVG — top left */}
      <div className='absolute top-[-0.7vw] left-[-2.8vw] aspect-[344/328] w-[23.9vw] opacity-40'>
        <Image src='/landing/card-left.svg' alt='' fill className='object-contain' />
      </div>

      {/* Card-right SVG — top right */}
      <div className='absolute top-[-2.8vw] right-[0vw] aspect-[471/470] w-[32.7vw] opacity-40'>
        <Image src='/landing/card-right.svg' alt='' fill className='object-contain' />
      </div>

      {/* Union-right SVG — bottom right */}
      <div className='absolute right-[-20%] bottom-[-10%] w-[75%] rotate-90 opacity-60'>
        <Image
          src='/landing/union-right.svg'
          alt=''
          width={768}
          height={768}
          className='h-auto w-full'
        />
      </div>

      {/* Static block strip — top right area */}
      <div className='absolute top-[10px] right-[13vw] w-[calc(140px_+_10.76vw)] max-w-[295px] opacity-60'>
        <svg
          width={295}
          height={34}
          viewBox='0 0 295 34'
          fill='none'
          xmlns='http://www.w3.org/2000/svg'
          className='h-auto w-full'
        >
          <rect opacity='0.6' width='85.3433' height='16.8626' rx={RX} fill='#2ABBF8' />
          <rect opacity='1' width='16.8626' height='16.8626' rx={RX} fill='#2ABBF8' />
          <rect opacity='0.6' x='34.2403' width='34.2403' height='33.7252' rx={RX} fill='#2ABBF8' />
          <rect opacity='1' x='34.2403' width='16.8626' height='16.8626' rx={RX} fill='#2ABBF8' />
          <rect opacity='1' x='51.6188' y='16.8626' width='16.8626' height='16.8626' rx={RX} fill='#2ABBF8' />
          <rect opacity='1' x='68.4812' width='54.6502' height='16.8626' rx={RX} fill='#00F701' />
          <rect opacity='0.6' x='106.268' width='34.2403' height='33.7252' rx={RX} fill='#00F701' />
          <rect opacity='0.6' x='106.268' width='51.103' height='16.8626' rx={RX} fill='#00F701' />
          <rect opacity='1' x='123.6484' y='16.8626' width='16.8626' height='16.8626' rx={RX} fill='#00F701' />
          <rect opacity='0.6' x='157.371' width='34.2403' height='16.8626' rx={RX} fill='#FFCC02' />
          <rect opacity='1' x='157.371' width='16.8626' height='16.8626' rx={RX} fill='#FFCC02' />
          <rect opacity='0.6' x='208.993' width='68.4805' height='16.8626' rx={RX} fill='#FA4EDF' />
          <rect opacity='0.6' x='209.137' width='16.8626' height='33.7252' rx={RX} fill='#FA4EDF' />
          <rect opacity='0.6' x='243.233' width='34.2403' height='33.7252' rx={RX} fill='#FA4EDF' />
          <rect opacity='1' x='243.233' width='16.8626' height='16.8626' rx={RX} fill='#FA4EDF' />
          <rect opacity='0.6' x='260.096' width='34.04' height='16.8626' rx={RX} fill='#FA4EDF' />
          <rect opacity='1' x='260.611' y='16.8626' width='16.8626' height='16.8626' rx={RX} fill='#FA4EDF' />
        </svg>
      </div>

      {/* Static block strip — top left area */}
      <div className='absolute top-[10px] left-[16vw] w-[calc(140px_+_10.76vw)] max-w-[295px] opacity-60'>
        <svg
          width={295}
          height={34}
          viewBox='0 0 295 34'
          fill='none'
          xmlns='http://www.w3.org/2000/svg'
          className='h-auto w-full'
        >
          <rect opacity='0.6' width='85.3433' height='16.8626' rx={RX} fill='#00F701' />
          <rect opacity='1' width='16.8626' height='16.8626' rx={RX} fill='#00F701' />
          <rect opacity='0.6' x='34.2403' width='34.2403' height='33.7252' rx={RX} fill='#00F701' />
          <rect opacity='1' x='34.2403' width='16.8626' height='16.8626' rx={RX} fill='#00F701' />
          <rect opacity='1' x='51.6188' y='16.8626' width='16.8626' height='16.8626' rx={RX} fill='#00F701' />
          <rect opacity='1' x='68.4812' width='54.6502' height='16.8626' rx={RX} fill='#FFCC02' />
          <rect opacity='0.6' x='106.268' width='34.2403' height='33.7252' rx={RX} fill='#FFCC02' />
          <rect opacity='0.6' x='106.268' width='51.103' height='16.8626' rx={RX} fill='#FFCC02' />
          <rect opacity='1' x='123.6484' y='16.8626' width='16.8626' height='16.8626' rx={RX} fill='#FFCC02' />
          <rect opacity='0.6' x='157.371' width='34.2403' height='16.8626' rx={RX} fill='#FA4EDF' />
          <rect opacity='1' x='157.371' width='16.8626' height='16.8626' rx={RX} fill='#FA4EDF' />
          <rect opacity='0.6' x='208.993' width='68.4805' height='16.8626' rx={RX} fill='#2ABBF8' />
          <rect opacity='0.6' x='209.137' width='16.8626' height='33.7252' rx={RX} fill='#2ABBF8' />
          <rect opacity='0.6' x='243.233' width='34.2403' height='33.7252' rx={RX} fill='#2ABBF8' />
          <rect opacity='1' x='243.233' width='16.8626' height='16.8626' rx={RX} fill='#2ABBF8' />
          <rect opacity='0.6' x='260.096' width='34.04' height='16.8626' rx={RX} fill='#2ABBF8' />
          <rect opacity='1' x='260.611' y='16.8626' width='16.8626' height='16.8626' rx={RX} fill='#2ABBF8' />
        </svg>
      </div>

      {/* Vertical block strip — left edge */}
      <div className='absolute top-[50%] left-0 w-[calc(16px_+_1.25vw)] max-w-[34px] -translate-y-1/2 opacity-60'>
        <svg
          width={34}
          height={226}
          viewBox='0 0 34 226.021'
          fill='none'
          xmlns='http://www.w3.org/2000/svg'
          className='h-auto w-full'
        >
          <rect opacity='0.6' width='34.240' height='33.725' rx={RX} fill='#FA4EDF' transform='matrix(0 1 1 0 0 0)' />
          <rect opacity='0.6' width='16.8626' height='68.480' rx={RX} fill='#FA4EDF' transform='matrix(-1 0 0 1 33.727 0)' />
          <rect opacity='1' width='16.8626' height='16.8626' rx={RX} fill='#FA4EDF' transform='matrix(-1 0 0 1 33.727 17.378)' />
          <rect opacity='0.6' width='16.8626' height='33.986' rx={RX} fill='#FA4EDF' transform='matrix(0 1 1 0 0 51.616)' />
          <rect opacity='0.6' width='16.8626' height='140.507' rx={RX} fill='#00F701' transform='matrix(-1 0 0 1 33.986 85.335)' />
          <rect opacity='0.4' x='17.119' y='136.962' width='34.240' height='16.8626' rx={RX} fill='#FFCC02' transform='rotate(-90 17.119 136.962)' />
          <rect opacity='1' x='17.119' y='136.962' width='16.8626' height='16.8626' rx={RX} fill='#FFCC02' transform='rotate(-90 17.119 136.962)' />
          <rect opacity='0.5' width='34.240' height='33.725' rx={RX} fill='#00F701' transform='matrix(0 1 1 0 0.257 153.825)' />
          <rect opacity='1' width='16.8626' height='16.8626' rx={RX} fill='#00F701' transform='matrix(0 1 1 0 0.257 153.825)' />
        </svg>
      </div>

      {/* Vertical block strip — right edge */}
      <div className='absolute top-[50%] right-0 w-[calc(16px_+_1.25vw)] max-w-[34px] -translate-y-1/2 opacity-60'>
        <svg
          width={34}
          height={205}
          viewBox='0 0 34 204.769'
          fill='none'
          xmlns='http://www.w3.org/2000/svg'
          className='h-auto w-full'
        >
          <rect opacity='0.6' width='16.8626' height='33.726' rx={RX} fill='#FA4EDF' transform='matrix(0 1 1 0 0 0)' />
          <rect opacity='0.6' width='34.241' height='16.8626' rx={RX} fill='#FA4EDF' transform='matrix(0 1 1 0 16.891 0)' />
          <rect opacity='0.6' width='16.8626' height='68.482' rx={RX} fill='#FA4EDF' transform='matrix(-1 0 0 1 33.739 16.888)' />
          <rect opacity='0.6' width='16.8626' height='33.726' rx={RX} fill='#FA4EDF' transform='matrix(0 1 1 0 0 33.776)' />
          <rect opacity='1' width='16.8626' height='16.8626' rx={RX} fill='#FA4EDF' transform='matrix(-1 0 0 1 33.739 34.272)' />
          <rect opacity='0.6' width='16.8626' height='33.726' rx={RX} fill='#FA4EDF' transform='matrix(0 1 1 0 0.012 68.510)' />
          <rect opacity='0.6' width='16.8626' height='102.384' rx={RX} fill='#2ABBF8' transform='matrix(-1 0 0 1 33.787 102.384)' />
          <rect opacity='0.4' x='17.131' y='153.859' width='34.241' height='16.8626' rx={RX} fill='#00F701' transform='rotate(-90 17.131 153.859)' />
          <rect opacity='1' x='17.131' y='153.859' width='16.8626' height='16.8626' rx={RX} fill='#00F701' transform='rotate(-90 17.131 153.859)' />
        </svg>
      </div>
    </div>
  )
}
