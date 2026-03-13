/** @jsxImportSource solid-js */
import { createSignal, createMemo, For, Show, onCleanup } from 'solid-js'
import type { RequestEntry } from '../store'

const TYPE_COLORS: Record<string, string> = {
  'server-fn': '#f97316',
  ssr: '#a855f7',
  'server-route': '#22c55e',
}

interface TimelineOverviewProps {
  entries: Array<RequestEntry>
  range: [number, number]
  onRangeChange: (range: [number, number]) => void
}

export default function TimelineOverview(props: TimelineOverviewProps) {
  let trackRef: HTMLDivElement | undefined

  const timeSpan = createMemo(() => {
    const entries = props.entries
    if (entries.length === 0) return { start: 0, end: 1000 }
    let minStart = Infinity
    let maxEnd = -Infinity
    for (const e of entries) {
      if (e.startTimestamp < minStart) minStart = e.startTimestamp
      const end = e.startTimestamp + (e.duration ?? 0)
      if (end > maxEnd) maxEnd = end
    }
    if (maxEnd <= minStart) maxEnd = minStart + 1000
    return { start: minStart, end: maxEnd }
  })

  const totalMs = createMemo(() => timeSpan().end - timeSpan().start)

  const ticks = createMemo(() => {
    const ms = totalMs()
    let interval: number
    if (ms <= 1000) interval = 200
    else if (ms <= 5000) interval = 1000
    else if (ms <= 20000) interval = 5000
    else interval = 10000

    const result: Array<{ label: string; pct: number }> = []
    const span = timeSpan()
    for (let t = 0; t <= ms; t += interval) {
      result.push({
        label: ms <= 2000 ? `${t}ms` : `${(t / 1000).toFixed(1)}s`,
        pct: (t / ms) * 100,
      })
    }
    // Always include the end
    if (result.length > 0 && result[result.length - 1]!.pct < 99) {
      result.push({
        label: ms <= 2000 ? `${ms.toFixed(0)}ms` : `${(ms / 1000).toFixed(1)}s`,
        pct: 100,
      })
    }
    return result
  })

  // Mini bars: each entry gets a bar positioned by startTimestamp, sized by duration
  const bars = createMemo(() => {
    const span = timeSpan()
    const ms = totalMs()
    return props.entries.map((entry, i) => {
      const left =
        ((entry.startTimestamp - span.start) / ms) * 100
      const width = Math.max(
        ((entry.duration ?? 0) / ms) * 100,
        0.5,
      )
      const color = TYPE_COLORS[entry.type ?? ''] ?? '#6b7280'
      // Stack rows vertically: cycle through 5 rows
      const row = i % 5
      return { left, width, color, row }
    })
  })

  // Drag logic
  const [dragging, setDragging] = createSignal<
    'left' | 'right' | 'body' | null
  >(null)
  const [dragStartX, setDragStartX] = createSignal(0)
  const [dragStartRange, setDragStartRange] = createSignal<[number, number]>([
    0, 1,
  ])

  function getTrackX(clientX: number): number {
    if (!trackRef) return 0
    const rect = trackRef.getBoundingClientRect()
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  }

  function onPointerDown(
    handle: 'left' | 'right' | 'body',
    e: PointerEvent,
  ) {
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    setDragging(handle)
    setDragStartX(e.clientX)
    setDragStartRange([...props.range])
  }

  function onPointerMove(e: PointerEvent) {
    const d = dragging()
    if (!d || !trackRef) return

    const rect = trackRef.getBoundingClientRect()
    const deltaNorm = (e.clientX - dragStartX()) / rect.width
    const [startL, startR] = dragStartRange()

    if (d === 'left') {
      const newLeft = Math.max(0, Math.min(startL + deltaNorm, props.range[1] - 0.02))
      props.onRangeChange([newLeft, props.range[1]])
    } else if (d === 'right') {
      const newRight = Math.min(1, Math.max(startR + deltaNorm, props.range[0] + 0.02))
      props.onRangeChange([props.range[0], newRight])
    } else if (d === 'body') {
      const rangeWidth = startR - startL
      let newLeft = startL + deltaNorm
      let newRight = startR + deltaNorm
      if (newLeft < 0) {
        newLeft = 0
        newRight = rangeWidth
      }
      if (newRight > 1) {
        newRight = 1
        newLeft = 1 - rangeWidth
      }
      props.onRangeChange([newLeft, newRight])
    }
  }

  function onPointerUp() {
    setDragging(null)
  }

  return (
    <div
      style={{
        padding: '6px 12px',
        'border-bottom': '1px solid var(--tsd-border, #333)',
        background: 'var(--tsd-bg-tertiary, #16162a)',
        'user-select': dragging() ? 'none' : 'auto',
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Time ruler */}
      <div
        style={{
          display: 'flex',
          'justify-content': 'space-between',
          position: 'relative',
          height: '14px',
          'margin-bottom': '2px',
        }}
      >
        <For each={ticks()}>
          {(tick) => (
            <span
              style={{
                position: 'absolute',
                left: `${tick.pct}%`,
                transform: 'translateX(-50%)',
                color: 'var(--tsd-text-tertiary, #666)',
                'font-size': '9px',
                'white-space': 'nowrap',
              }}
            >
              {tick.label}
            </span>
          )}
        </For>
      </div>

      {/* Track with mini bars and range selector */}
      <div
        ref={trackRef}
        style={{
          position: 'relative',
          height: '32px',
          background: 'var(--tsd-bg-secondary, #1a1a2e)',
          'border-radius': '4px',
          overflow: 'hidden',
        }}
      >
        {/* Mini bars */}
        <For each={bars()}>
          {(bar) => (
            <div
              style={{
                position: 'absolute',
                left: `${bar.left}%`,
                width: `${Math.max(bar.width, 0.3)}%`,
                height: '4px',
                top: `${4 + bar.row * 5}px`,
                'background-color': bar.color,
                'border-radius': '2px',
                opacity: '0.6',
              }}
            />
          )}
        </For>

        {/* Dimmed areas outside range */}
        <div
          style={{
            position: 'absolute',
            left: '0',
            width: `${props.range[0] * 100}%`,
            top: '0',
            bottom: '0',
            background: 'rgba(0,0,0,0.4)',
            'pointer-events': 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: `${props.range[1] * 100}%`,
            right: '0',
            top: '0',
            bottom: '0',
            background: 'rgba(0,0,0,0.4)',
            'pointer-events': 'none',
          }}
        />

        {/* Range selector body (draggable) */}
        <div
          style={{
            position: 'absolute',
            left: `${props.range[0] * 100}%`,
            width: `${(props.range[1] - props.range[0]) * 100}%`,
            top: '0',
            bottom: '0',
            background: 'rgba(99, 102, 241, 0.1)',
            'border-left': '2px solid #6366f1',
            'border-right': '2px solid #6366f1',
            cursor: 'grab',
          }}
          onPointerDown={(e: PointerEvent) => onPointerDown('body', e)}
        >
          {/* Left handle */}
          <div
            style={{
              position: 'absolute',
              left: '-5px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '8px',
              height: '20px',
              background: '#6366f1',
              'border-radius': '3px',
              cursor: 'ew-resize',
              'z-index': '1',
            }}
            onPointerDown={(e: PointerEvent) => {
              e.stopPropagation()
              onPointerDown('left', e)
            }}
          />
          {/* Right handle */}
          <div
            style={{
              position: 'absolute',
              right: '-5px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '8px',
              height: '20px',
              background: '#6366f1',
              'border-radius': '3px',
              cursor: 'ew-resize',
              'z-index': '1',
            }}
            onPointerDown={(e: PointerEvent) => {
              e.stopPropagation()
              onPointerDown('right', e)
            }}
          />
        </div>
      </div>
    </div>
  )
}
