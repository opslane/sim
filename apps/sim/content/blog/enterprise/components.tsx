interface ContactButtonProps {
  href: string
  children: React.ReactNode
}

export function ContactButton({ href, children }: ContactButtonProps) {
  return (
    <a
      href={href}
      target='_blank'
      rel='noopener noreferrer'
      className='inline-flex items-center h-[32px] rounded-[5px] border gap-[8px] border-[#33C482] bg-[#33C482] px-[10px] font-[430] font-season text-[14px] !text-black !no-underline transition-[filter] hover:brightness-110'
    >
      {children}
    </a>
  )
}
