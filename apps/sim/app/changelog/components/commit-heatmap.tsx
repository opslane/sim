'use client'

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import type { ChangelogEntry } from '@/app/changelog/components/changelog-content'

const HEATMAP_COLORS = ['#2ABBF8', '#00F701', '#FFCC02', '#FA4EDF'] as const
const GREEN_BASE = '#39d353'
const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

const CELL_SIZE = 10
const CELL_GAP = 3
const CELL_RADIUS = 2
const DAY_LABEL_WIDTH = 28
const MONTH_ROW_HEIGHT = 16
const MAX_HEATMAP_WEEKS = 26
const SNAKE_LENGTH = 12

const EASING_K = 8
const SNAP_CELLS = 10
const SETTLE_THRESHOLD = 0.0001

interface CellData {
  date: string
  weekIndex: number
  dayIndex: number
  seqIndex: number
  traversalIndex: number
}

interface GridData {
  cells: CellData[]
  dates: Date[]
  monthLabels: Array<{ label: string; weekIndex: number }>
  dayLabels: Array<{ label: string; dayIndex: number }>
  numWeeks: number
  svgWidth: number
  svgHeight: number
}

function formatDateToISO(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function greenOpacity(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return 0.06 + (x - Math.floor(x)) * 0.2
}

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return x - Math.floor(x)
}

function cellPixel(cell: CellData): [number, number] {
  return [
    DAY_LABEL_WIDTH + cell.weekIndex * (CELL_SIZE + CELL_GAP),
    MONTH_ROW_HEIGHT + cell.dayIndex * (CELL_SIZE + CELL_GAP),
  ]
}

function computeGrid(entries: ChangelogEntry[]): GridData | null {
  if (!entries.length) return null
  const earliestEntry = entries.reduce(
    (earliest, entry) => {
      const d = entry.date.split('T')[0]
      return d < earliest ? d : earliest
    },
    entries[0].date.split('T')[0]
  )
  const earliestDate = new Date(`${earliestEntry}T00:00:00`)
  earliestDate.setDate(earliestDate.getDate() - earliestDate.getDay())

  const now = new Date()
  const endSaturday = new Date(now)
  endSaturday.setDate(endSaturday.getDate() + (6 - endSaturday.getDay()))
  const maxWindowStart = new Date(endSaturday)
  maxWindowStart.setDate(maxWindowStart.getDate() - (MAX_HEATMAP_WEEKS * 7 - 1))
  const startDate = earliestDate > maxWindowStart ? earliestDate : maxWindowStart

  const dates: Date[] = []
  const current = new Date(startDate)
  while (current <= endSaturday) {
    dates.push(new Date(current))
    current.setDate(current.getDate() + 1)
  }

  const numWeeks = Math.ceil(dates.length / 7)
  const cells: CellData[] = dates.map((date, seqIndex) => {
    const reverseSeq = dates.length - 1 - seqIndex
    const columnFromRight = Math.floor(reverseSeq / 7)
    const rowInColumn = reverseSeq % 7
    const goingDown = columnFromRight % 2 === 0
    const dayIndex = goingDown ? rowInColumn : 6 - rowInColumn
    const weekIndex = numWeeks - 1 - columnFromRight
    return {
      date: formatDateToISO(date),
      weekIndex,
      dayIndex,
      seqIndex,
      traversalIndex: reverseSeq,
    }
  })

  const earliestCellByWeek = new Map<number, CellData>()
  for (const cell of cells) {
    const existing = earliestCellByWeek.get(cell.weekIndex)
    if (!existing || cell.seqIndex < existing.seqIndex) {
      earliestCellByWeek.set(cell.weekIndex, cell)
    }
  }

  const MIN_LABEL_GAP_WEEKS = 3
  const rawLabels: Array<{ label: string; weekIndex: number }> = []
  let prevMonth = -1
  for (let w = 0; w < numWeeks; w++) {
    const earliest = earliestCellByWeek.get(w)
    if (!earliest) continue
    const month = new Date(`${earliest.date}T00:00:00`).getMonth()
    if (month !== prevMonth) {
      rawLabels.push({ label: MONTH_NAMES[month], weekIndex: w })
      prevMonth = month
    }
  }

  const monthLabels: Array<{ label: string; weekIndex: number }> = []
  for (let i = 0; i < rawLabels.length; i++) {
    const cur = rawLabels[i]
    const next = rawLabels[i + 1]
    if (next && next.weekIndex - cur.weekIndex < MIN_LABEL_GAP_WEEKS) continue
    if (
      monthLabels.length > 0 &&
      cur.weekIndex - monthLabels[monthLabels.length - 1].weekIndex < MIN_LABEL_GAP_WEEKS
    ) {
      continue
    }
    monthLabels.push(cur)
  }

  const EST_LABEL_WIDTH = 24
  while (
    monthLabels.length > 0 &&
    DAY_LABEL_WIDTH +
      monthLabels[monthLabels.length - 1].weekIndex * (CELL_SIZE + CELL_GAP) +
      EST_LABEL_WIDTH >
      DAY_LABEL_WIDTH + numWeeks * (CELL_SIZE + CELL_GAP) - CELL_GAP
  ) {
    monthLabels.pop()
  }

  const gridWidth = numWeeks * (CELL_SIZE + CELL_GAP) - CELL_GAP
  const gridHeight = 7 * (CELL_SIZE + CELL_GAP) - CELL_GAP
  const svgWidth = DAY_LABEL_WIDTH + gridWidth + 16
  const svgHeight = MONTH_ROW_HEIGHT + gridHeight

  return {
    cells,
    dates,
    monthLabels,
    dayLabels: [
      { label: 'Mon', dayIndex: 1 },
      { label: 'Wed', dayIndex: 3 },
      { label: 'Fri', dayIndex: 5 },
    ],
    numWeeks,
    svgWidth,
    svgHeight,
  }
}

export interface CommitHeatmapHandle {
  setProgress: (progress: number) => void
}

interface CommitHeatmapProps {
  entries: ChangelogEntry[]
  activeDate?: string
  progress?: number
}

export const CommitHeatmap = forwardRef<CommitHeatmapHandle, CommitHeatmapProps>(
  function CommitHeatmap({ entries, progress }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const gridRef = useRef<GridData | null>(null)
    const targetRef = useRef(0)
    const currentRef = useRef(0)
    const prevPosRef = useRef(-1)
    const directionRef = useRef<1 | -1>(1)
    const rafRef = useRef(0)
    const lastTsRef = useRef(0)
    const runningRef = useRef(false)

    const grid = useMemo(() => computeGrid(entries), [entries])
    gridRef.current = grid

    const draw = useCallback(() => {
      const canvas = canvasRef.current
      const g = gridRef.current
      if (!canvas || !g) return

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const { cells, monthLabels, dayLabels, svgWidth, svgHeight } = g
      const p = currentRef.current
      const totalCells = Math.max(0, cells.length - 1)
      const effectivePos = p * totalCells

      if (prevPosRef.current >= 0) {
        if (effectivePos > prevPosRef.current) directionRef.current = 1
        else if (effectivePos < prevPosRef.current) directionRef.current = -1
      }
      prevPosRef.current = effectivePos

      const goingBack = directionRef.current === 1
      const maxTail = goingBack ? effectivePos : totalCells - effectivePos
      const snakeLen = Math.min(SNAKE_LENGTH, maxTail)
      const snakeStart = goingBack ? effectivePos - snakeLen : effectivePos
      const snakeEnd = goingBack ? effectivePos : effectivePos + snakeLen

      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      const w = Math.round(rect.width * dpr)
      const h = Math.round(rect.height * dpr)
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const scaleX = w / svgWidth
      const scaleY = h / svgHeight
      const scale = Math.min(scaleX, scaleY)
      const tx = (w - svgWidth * scale) / 2
      const ty = (h - svgHeight * scale) / 2
      ctx.setTransform(scale, 0, 0, scale, tx, ty)

      ctx.fillStyle = 'rgba(246,246,246,0.4)'
      ctx.font = '9px var(--font-season), system-ui, sans-serif'
      ctx.textBaseline = 'middle'
      for (const { label, weekIndex: wi } of monthLabels) {
        ctx.fillText(label, DAY_LABEL_WIDTH + wi * (CELL_SIZE + CELL_GAP), 11)
      }
      for (const { label, dayIndex } of dayLabels) {
        const y = MONTH_ROW_HEIGHT + dayIndex * (CELL_SIZE + CELL_GAP) + CELL_SIZE - 1
        ctx.fillText(label, 4, y)
      }

      const fillRR = (rx: number, ry: number, rw: number, rh: number, r: number) => {
        ctx.beginPath()
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(rx, ry, rw, rh, r)
        } else {
          ctx.moveTo(rx + r, ry)
          ctx.lineTo(rx + rw - r, ry)
          ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + r)
          ctx.lineTo(rx + rw, ry + rh - r)
          ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - r, ry + rh)
          ctx.lineTo(rx + r, ry + rh)
          ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - r)
          ctx.lineTo(rx, ry + r)
          ctx.quadraticCurveTo(rx, ry, rx + r, ry)
        }
        ctx.fill()
      }

      for (const cell of cells) {
        const [x, y] = cellPixel(cell)
        const greenOp = greenOpacity(cell.seqIndex)
        const isInSnake =
          effectivePos > 0 &&
          cell.traversalIndex >= snakeStart &&
          cell.traversalIndex <= snakeEnd

        ctx.fillStyle = GREEN_BASE
        ctx.globalAlpha = greenOp
        fillRR(x, y, CELL_SIZE, CELL_SIZE, CELL_RADIUS)

        if (isInSnake) {
          const distFromHead = Math.abs(cell.traversalIndex - effectivePos)
          const t = snakeLen > 0 ? distFromHead / snakeLen : 0
          const colorOp = 0.9 - t * 0.75
          const colorIdx = Math.floor(pseudoRandom(cell.seqIndex + 1) * HEATMAP_COLORS.length)
          ctx.fillStyle = HEATMAP_COLORS[colorIdx]
          ctx.globalAlpha = colorOp
          fillRR(x, y, CELL_SIZE, CELL_SIZE, CELL_RADIUS)
        }
        ctx.globalAlpha = 1
      }

      if (effectivePos > 0 && cells.length > 1) {
        const floorT = Math.floor(effectivePos)
        const ceilT = Math.min(floorT + 1, totalCells)
        const frac = effectivePos - floorT
        const cellA = cells[cells.length - 1 - floorT]
        const cellB = cells[cells.length - 1 - ceilT]

        if (cellA && cellB) {
          const [ax, ay] = cellPixel(cellA)
          const [bx, by] = cellPixel(cellB)
          const hx = ax + (bx - ax) * frac
          const hy = ay + (by - ay) * frac

          ctx.save()
          ctx.shadowColor = '#ffffff'
          ctx.shadowBlur = 6
          ctx.fillStyle = '#ffffff'
          ctx.globalAlpha = 0.7
          fillRR(hx, hy, CELL_SIZE, CELL_SIZE, CELL_RADIUS)
          ctx.restore()
        }
      }
    }, [])

    const animate = useCallback((timestamp: number) => {
      const g = gridRef.current
      if (!g) {
        runningRef.current = false
        return
      }

      const target = targetRef.current
      const current = currentRef.current
      const delta = target - current
      const totalCells = Math.max(1, g.cells.length - 1)
      const cellDelta = Math.abs(delta) * totalCells

      if (cellDelta < SETTLE_THRESHOLD) {
        currentRef.current = target
        draw()
        runningRef.current = false
        lastTsRef.current = 0
        return
      }

      const dt =
        lastTsRef.current > 0
          ? Math.min((timestamp - lastTsRef.current) / 1000, 0.1)
          : 1 / 60
      lastTsRef.current = timestamp

      const k = cellDelta > SNAP_CELLS ? 20 : EASING_K
      const factor = 1 - Math.exp(-k * dt)
      currentRef.current = current + delta * factor

      draw()
      rafRef.current = requestAnimationFrame(animate)
    }, [draw])

    const startLoop = useCallback(() => {
      if (runningRef.current) return
      runningRef.current = true
      lastTsRef.current = 0
      rafRef.current = requestAnimationFrame(animate)
    }, [animate])

    useImperativeHandle(
      ref,
      () => ({
        setProgress(p: number) {
          targetRef.current = Math.max(0, Math.min(1, p))
          startLoop()
        },
      }),
      [startLoop]
    )

    useEffect(() => {
      if (progress !== undefined) {
        targetRef.current = progress
        startLoop()
      }
    }, [progress, startLoop])

    useEffect(() => {
      if (grid) draw()
    }, [grid, draw])

    useEffect(() => {
      const canvas = canvasRef.current
      if (!canvas || !grid) return
      const ro = new ResizeObserver(() => draw())
      ro.observe(canvas)
      return () => ro.disconnect()
    }, [grid, draw])

    useEffect(
      () => () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current)
      },
      []
    )

    if (!entries.length || !grid) return null

    return (
      <div className='mt-8 w-full' style={{ contain: 'layout paint' }}>
        <canvas
          ref={canvasRef}
          width={grid.svgWidth}
          height={grid.svgHeight}
          className='w-full'
          style={{ display: 'block', width: '100%', height: 'auto' }}
          role='img'
          aria-label='Release activity heatmap'
        />
      </div>
    )
  }
)
