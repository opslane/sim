'use client'

export function MothershipView() {
  return (
    <div className='flex h-full w-[480px] flex-shrink-0 flex-col border-[var(--border)] border-l'>
      <div className='flex items-center border-[var(--border)] border-b px-[16px] py-[12px]'>
        <span className='font-medium text-[13px] text-[var(--text-secondary)]'>Mothership</span>
      </div>
      <div className='flex flex-1 items-center justify-center'>
        <span className='text-[13px] text-[var(--text-muted)]'>No artifacts yet</span>
      </div>
    </div>
  )
}
