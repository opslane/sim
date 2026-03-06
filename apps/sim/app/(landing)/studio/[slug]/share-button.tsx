'use client'

import { useState } from 'react'
import { Share2 } from 'lucide-react'

interface ShareButtonProps {
  url: string
  title: string
}

export function ShareButton({ url }: ShareButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* noop */
    }
  }

  return (
    <button
      onClick={handleCopy}
      className='flex items-center gap-1.5 font-season font-[430] text-[#F6F6F0]/50 text-sm hover:text-[#F6F6F0]/80'
      aria-label='Copy link'
    >
      <Share2 className='h-4 w-4' />
      <span>{copied ? 'Copied!' : 'Share'}</span>
    </button>
  )
}
