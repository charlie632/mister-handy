import { type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useState } from "react"

const WIDTH_KEY = "mr-handy:panel-width"
const MIN_WIDTH = 320
const DEFAULT_WIDTH = 440
const MAX_FRACTION = 0.7

const clamp = (width: number) => Math.round(Math.max(MIN_WIDTH, Math.min(width, window.innerWidth * MAX_FRACTION)))

const readWidth = () => {
  try {
    const saved = Number(window.localStorage.getItem(WIDTH_KEY))

    return saved > 0 ? clamp(saved) : DEFAULT_WIDTH
  } catch {
    return DEFAULT_WIDTH
  }
}

export const PanelIcon = ({ open }: { open: boolean }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M15 3v18" />
    <path d={open ? "m8 9 3 3-3 3" : "m10 15-3-3 3-3"} />
  </svg>
)

/** Props for the control that shows or hides the panel. Render it as a link so it works before the page hydrates. */
export const panelToggleProps = (open: boolean) => ({
  className: "icon-btn",
  title: open ? "Hide panel" : "Show panel",
  "aria-label": open ? "Hide panel" : "Show panel",
  "aria-pressed": open,
  children: <PanelIcon open={open} />
})

/** Sits beside the page on wide screens and slides over it on narrow ones. Drag its left edge to resize. */
export function RightPanel({
  open,
  label,
  title,
  close,
  onClose,
  children
}: {
  open: boolean
  /** Names the panel for screen readers. */
  label: string
  title: ReactNode
  /** The panel's own close control, made with panelToggleProps(true). */
  close: ReactNode
  /** Escape and a click on the backdrop. */
  onClose: () => void
  children: ReactNode
}) {
  const [width, setWidth] = useState(DEFAULT_WIDTH)

  useEffect(() => setWidth(readWidth()), [])

  useEffect(() => {
    if (!open) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) onClose()
    }

    window.addEventListener("keydown", onKey)

    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    const startX = event.clientX
    const startWidth = width
    let next = startWidth

    const move = (e: PointerEvent) => {
      next = clamp(startWidth + startX - e.clientX)
      setWidth(next)
    }

    const end = () => {
      handle.removeEventListener("pointermove", move)
      handle.removeEventListener("pointerup", end)
      handle.removeEventListener("pointercancel", end)
      document.body.classList.remove("resizing")

      try {
        window.localStorage.setItem(WIDTH_KEY, String(next))
      } catch {}
    }

    document.body.classList.add("resizing")
    handle.addEventListener("pointermove", move)
    handle.addEventListener("pointerup", end)
    handle.addEventListener("pointercancel", end)
  }

  if (!open) return null

  return (
    <>
      <div className="panel-backdrop" onClick={onClose} />
      <aside className="panel" style={{ width }} aria-label={label}>
        <div className="panel-resize" onPointerDown={startResize} role="separator" aria-orientation="vertical" />
        <div className="panel-head">
          <div className="panel-title">{title}</div>
          {close}
        </div>
        <div className="panel-body">{children}</div>
      </aside>
    </>
  )
}
