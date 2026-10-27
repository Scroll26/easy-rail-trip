import { useRef, useState } from 'react'

// Phone bottom sheet: drag the header to any height, release to snap to
// peek / half / full. A plain tap on a tab still works as a click.

export type SheetState = 'peek' | 'half' | 'full'

const PEEK = 104
const DRAG_THRESHOLD = 6
/** px per ms; faster than this on release counts as a flick */
const FLICK_SPEED = 0.5
/** A finger resting longer than this before release is not a flick */
const FLICK_MAX_PAUSE = 80

const ORDER: SheetState[] = ['peek', 'half', 'full']

const isPhone = () => window.matchMedia('(max-width: 799px)').matches

function snapHeights(panel: HTMLElement): Record<SheetState, number> {
  return { peek: PEEK, half: Math.round(window.innerHeight * 0.55), full: panel.offsetHeight }
}

export function useBottomSheet() {
  const [state, setState] = useState<SheetState>('peek')
  const panelRef = useRef<HTMLElement>(null)
  const justDragged = useRef(false)

  const open = state !== 'peek'
  /** Compatibility with "open/close": opening from peek goes to half height */
  const setOpen = (o: boolean) => setState((s) => (o ? (s === 'peek' ? 'half' : s) : 'peek'))

  function onPointerDown(e: React.PointerEvent) {
    const panel = panelRef.current
    if (!panel || !isPhone() || e.button > 0) return
    const full = snapHeights(panel).full
    const startY = e.clientY
    const startVisible = window.innerHeight - panel.getBoundingClientRect().top
    let moved = false
    let visible = startVisible
    let lastY = startY
    let lastT = e.timeStamp
    let speed = 0

    // Follow the finger anywhere on screen, not just over the header
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      const dy = startY - ev.clientY
      if (!moved) {
        if (Math.abs(dy) < DRAG_THRESHOLD) return
        moved = true
        panel.style.transition = 'none'
      }
      visible = Math.min(full, Math.max(PEEK * 0.6, startVisible + dy))
      panel.style.transform = `translateY(${full - visible}px)`
      const dt = ev.timeStamp - lastT
      if (dt > 0) speed = (lastY - ev.clientY) / dt
      lastY = ev.clientY
      lastT = ev.timeStamp
    }
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      if (!moved) return
      panel.style.transition = ''
      panel.style.transform = ''
      if (ev.type === 'pointercancel') return
      const snaps = snapHeights(panel)
      let target = ORDER.reduce((best, s) => (Math.abs(snaps[s] - visible) < Math.abs(snaps[best] - visible) ? s : best))
      // A quick flick moves one step in that direction
      if (ev.timeStamp - lastT < FLICK_MAX_PAUSE && Math.abs(speed) > FLICK_SPEED) {
        const below = ORDER.reduce((best, s, i) => (snaps[s] <= visible ? i : best), 0)
        target = ORDER[Math.max(0, Math.min(2, speed > 0 ? below + 1 : below))]
      }
      setState(target)
      justDragged.current = true
      setTimeout(() => (justDragged.current = false), 0)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  const headerProps = {
    onPointerDown,
    /** Swallow the click that ends a drag */
    onClickCapture(e: React.MouseEvent) {
      if (justDragged.current) {
        e.stopPropagation()
        e.preventDefault()
      }
    },
  }

  return { state, setState, open, setOpen, panelRef, headerProps }
}
