import { useEffect, useRef, useCallback } from 'react'

interface UseBarcodeOptions {
  /** Called when a complete barcode scan is detected */
  onScan: (barcode: string) => void
  /** Whether the hook is currently active (default: true) */
  active?: boolean
  /** Minimum barcode length to be considered valid (default: 3) */
  minLength?: number
  /**
   * Max milliseconds between keystrokes to still be considered a scanner.
   * USB scanners fire all characters in < 50ms total.
   * Humans type at ~150-300ms per key.
   * Default: 50ms
   */
  maxMsBetweenChars?: number
}

/**
 * Detects USB barcode scanner input.
 *
 * USB scanners behave exactly like a keyboard but type all characters
 * within ~50ms and always end with Enter. This hook distinguishes
 * scanner input from human typing by measuring keystroke speed.
 *
 * Usage:
 *   useBarcode({ onScan: (code) => handleScan(code) })
 *
 * Works globally — no input needs to be focused.
 * Ignored when the user is actively typing in an <input> or <textarea>
 * (unless that input is a dedicated barcode field).
 */
export function useBarcode({
  onScan,
  active = true,
  minLength = 3,
  maxMsBetweenChars = 50,
}: UseBarcodeOptions) {
  const buffer       = useRef<string>('')
  const lastKeyTime  = useRef<number>(0)
  const firstKeyTime = useRef<number>(0)
  const flushTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback(() => {
    const code = buffer.current.trim()
    buffer.current = ''
    firstKeyTime.current = 0
    if (code.length >= minLength) {
      onScan(code)
    }
  }, [onScan, minLength])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!active) return

    // Don't intercept when user is in a regular form field
    // (scanner input in a dedicated field is handled separately)
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
    const isBarcodeField = (e.target as HTMLElement)?.getAttribute('data-barcode-input') === 'true'
    if ((tag === 'input' || tag === 'textarea' || tag === 'select') && !isBarcodeField) return

    // Ignore keyboard shortcuts
    if (e.ctrlKey || e.altKey || e.metaKey) return

    const now = Date.now()

    if (e.key === 'Enter') {
      if (buffer.current.length >= minLength) {
        const elapsed = now - firstKeyTime.current
        // Accept if total scan time is reasonable (< 500ms for the whole barcode)
        if (elapsed < 500 || buffer.current.length < 6) {
          flush()
        } else {
          buffer.current = ''
        }
      } else {
        buffer.current = ''
      }
      return
    }

    // Only accumulate printable single characters
    if (e.key.length !== 1) return

    const timeSinceLast = now - lastKeyTime.current
    lastKeyTime.current = now

    // If too slow between keystrokes, this is human typing — reset
    if (buffer.current.length > 0 && timeSinceLast > maxMsBetweenChars * 3) {
      buffer.current = ''
      firstKeyTime.current = 0
    }

    if (buffer.current.length === 0) {
      firstKeyTime.current = now
    }

    buffer.current += e.key

    // Auto-flush in case Enter never arrives
    if (flushTimeout.current) clearTimeout(flushTimeout.current)
    flushTimeout.current = setTimeout(() => {
      buffer.current = ''
      firstKeyTime.current = 0
    }, 300)
  }, [active, minLength, maxMsBetweenChars, flush])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      if (flushTimeout.current) clearTimeout(flushTimeout.current)
    }
  }, [handleKeyDown])
}

/**
 * Simulates a barcode scan programmatically.
 * Used by the dev test panel and camera scanner to fire the same
 * event pipeline as a real USB scanner.
 */
export function simulateScan(barcode: string) {
  const chars = barcode.split('')
  const DELAY = 5 // 5ms between chars — realistic scanner speed

  chars.forEach((char, i) => {
    setTimeout(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }))
      window.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }))
    }, i * DELAY)
  })

  // Fire Enter after all chars
  setTimeout(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  }, chars.length * DELAY + 10)
}
