import { useEffect, useRef } from 'react'
import { art, sky } from '../site/sky.js'

// The Stranger page's pictures, reused by Duebook and the bench: a living sky beside the login and a
// halftone sky behind the total. Both are decoration only (hidden from screen readers).

// Under test automation (Kane's browser sets navigator.webdriver) the sky draws one still frame, so runs
// stay quick on machines without a GPU and every screenshot shows the same sky.
const automated = typeof navigator !== 'undefined' && !!navigator.webdriver

export function SkyPanel({ head, children }) {
  const frame = useRef(null)
  const canvas = useRef(null)
  const copy = useRef(null)
  const gather = useRef(null)
  // Clouds part behind the copy and bank up around an unseen spot near the top (the page's tear does this there).
  useEffect(() => sky(canvas.current, frame.current, copy.current, gather.current, { still: automated }), [])
  return (
    <section ref={frame} className="sky-panel">
      <canvas ref={canvas} className="sky" aria-hidden="true" />
      <i ref={gather} className="sky-gather" aria-hidden="true" />
      {head}
      <div ref={copy} className="sky-copy">
        {children}
      </div>
    </section>
  )
}

export function Halftone({ seed = 1 }) {
  const ref = useRef(null)
  useEffect(() => art([ref.current]), [])
  return <canvas ref={ref} className="art" data-seed={seed} aria-hidden="true" />
}
