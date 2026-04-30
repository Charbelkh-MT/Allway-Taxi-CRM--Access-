/**
 * BarcodeScanDev — floating developer test panel
 *
 * Only rendered when import.meta.env.DEV is true (local dev server).
 * Never appears in production builds.
 *
 * Lets you type any barcode and press Enter (or click Scan) to fire
 * the exact same event pipeline as a real USB barcode scanner.
 */
import { useState, useRef } from 'react'
import { ScanBarcode, ChevronDown, ChevronUp } from 'lucide-react'
import { simulateScan } from '@/hooks/useBarcode'

const SAMPLE_BARCODES = [
  { label: 'Samsung A16', code: '8806095844701' },
  { label: 'iPhone 15 Case', code: '0194253418481' },
  { label: 'USB-C Cable 1m', code: '6901443157097' },
  { label: 'Alfa 15.15 Card', code: 'ALFA-15-TEST01' },
  { label: 'Touch 07.58 Card', code: 'TUCH-07-TEST02' },
]

export function BarcodeScanDev() {
  // Never render in production
  if (!import.meta.env.DEV) return null

  const [code, setCode]         = useState('')
  const [expanded, setExpanded] = useState(true)
  const [flash, setFlash]       = useState(false)
  const inputRef                = useRef<HTMLInputElement>(null)

  function fire(barcode: string) {
    if (!barcode.trim()) return
    setFlash(true)
    simulateScan(barcode.trim())
    setTimeout(() => setFlash(false), 400)
    setCode('')
    inputRef.current?.focus()
  }

  return (
    <div
      className="fixed bottom-4 left-4 z-50 font-mono text-xs select-none"
      style={{ width: expanded ? 260 : 44 }}
    >
      <div
        className={`rounded-xl border-2 shadow-xl transition-all duration-200 overflow-hidden ${
          flash ? 'border-green-400 bg-green-50' : 'border-amber-400 bg-amber-50'
        }`}
      >
        {/* Header */}
        <button
          onClick={() => setExpanded(e => !e)}
          className="w-full flex items-center gap-2 px-3 py-2 text-amber-800 font-bold hover:bg-amber-100 transition-colors"
        >
          <ScanBarcode className="w-4 h-4 shrink-0" />
          {expanded && <span className="flex-1 text-left">Scanner Dev Panel</span>}
          {expanded ? <ChevronDown className="w-3 h-3" /> : null}
        </button>

        {expanded && (
          <div className="px-3 pb-3 space-y-2">
            {/* Manual entry */}
            <div className="flex gap-1">
              <input
                ref={inputRef}
                value={code}
                onChange={e => setCode(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') fire(code) }}
                placeholder="Type barcode…"
                className="flex-1 px-2 py-1 rounded border border-amber-300 bg-white text-xs focus:outline-none focus:border-amber-500"
                autoFocus
              />
              <button
                onClick={() => fire(code)}
                className="px-2 py-1 rounded bg-amber-500 text-white hover:bg-amber-600 transition-colors font-bold"
              >
                ↵
              </button>
            </div>

            {/* Quick-fire sample barcodes */}
            <div className="space-y-1">
              <p className="text-amber-600 uppercase tracking-wide" style={{ fontSize: 9 }}>
                Quick samples
              </p>
              {SAMPLE_BARCODES.map(s => (
                <button
                  key={s.code}
                  onClick={() => fire(s.code)}
                  className="w-full text-left px-2 py-1 rounded hover:bg-amber-100 transition-colors flex items-center justify-between gap-1"
                >
                  <span className="text-amber-900">{s.label}</span>
                  <span className="text-amber-500 truncate" style={{ fontSize: 9 }}>{s.code}</span>
                </button>
              ))}
            </div>

            <p className="text-amber-500 text-center" style={{ fontSize: 9 }}>
              DEV ONLY — not visible in production
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
