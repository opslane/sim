import { martianMono } from '@/app/_styles/fonts/martian-mono/martian-mono'
import { season } from '@/app/_styles/fonts/season/season'
import Navbar from '@/app/(home)/components/navbar/navbar'

export default function ChangelogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${season.variable} ${martianMono.variable} relative min-h-screen`}>
      <div className='-z-50 pointer-events-none fixed inset-0 bg-[#1C1C1C]' />
      <Navbar />
      {children}
    </div>
  )
}
