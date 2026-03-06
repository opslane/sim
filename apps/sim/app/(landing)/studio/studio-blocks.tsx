'use client'

import {
  BlocksLeftAnimated,
  BlocksRightAnimated,
  BlocksRightSideAnimated,
  BlocksTopLeftAnimated,
  BlocksTopRightAnimated,
  useBlockCycle,
} from '@/app/(home)/components/hero/components/animated-blocks'

export function StudioBlocks() {
  const blockStates = useBlockCycle()

  return (
    <>
      <div
        aria-hidden='true'
        className='pointer-events-none absolute top-0 right-[13.1vw] z-20 w-[calc(140px_+_10.76vw)] max-w-[295px]'
      >
        <BlocksTopRightAnimated animState={blockStates.topRight} />
      </div>

      <div
        aria-hidden='true'
        className='pointer-events-none absolute top-0 left-[16vw] z-20 w-[calc(140px_+_10.76vw)] max-w-[295px]'
      >
        <BlocksTopLeftAnimated animState={blockStates.topLeft} />
      </div>

      <div
        aria-hidden='true'
        className='-translate-y-1/2 pointer-events-none absolute top-[50%] left-0 z-20 w-[calc(16px_+_1.25vw)] max-w-[34px]'
      >
        <BlocksLeftAnimated animState={blockStates.left} />
      </div>

      <div
        aria-hidden='true'
        className='-translate-y-1/2 pointer-events-none absolute top-[50%] right-0 z-20 w-[calc(16px_+_1.25vw)] max-w-[34px]'
      >
        <BlocksRightAnimated animState={blockStates.rightEdge} />
      </div>

      <div
        aria-hidden='true'
        className='-translate-y-1/2 pointer-events-none absolute top-[50%] right-[3vw] z-20 w-[calc(16px_+_1.25vw)] max-w-[34px] scale-x-[-1]'
      >
        <BlocksRightSideAnimated animState={blockStates.rightSide} />
      </div>
    </>
  )
}
