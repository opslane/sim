import type { Metadata } from 'next'
import ChangelogContent from '@/app/changelog/components/changelog-content'
import type { ChangelogVariant } from '@/app/changelog/components/changelog-content'

export const metadata: Metadata = {
  title: 'Changelog',
  description: 'Stay up-to-date with the latest features, improvements, and bug fixes in Sim.',
  openGraph: {
    title: 'Changelog',
    description: 'Stay up-to-date with the latest features, improvements, and bug fixes in Sim.',
    type: 'website',
  },
}

const VALID_VARIANTS: ChangelogVariant[] = ['breaks', 'scroll']

interface ChangelogPageProps {
  searchParams: Promise<{ v?: string }>
}

export default async function ChangelogPage({ searchParams }: ChangelogPageProps) {
  const { v } = await searchParams
  const variant = VALID_VARIANTS.includes(v as ChangelogVariant)
    ? (v as ChangelogVariant)
    : undefined
  return <ChangelogContent variant={variant} />
}
