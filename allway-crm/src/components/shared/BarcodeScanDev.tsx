/**
 * BarcodeScanDev — barcode scanner test panel
 *
 * Visible in DEV mode always.
 * In production: hidden by default, toggle with Ctrl+Shift+B.
 *
 * Simulates a USB barcode scanner by dispatching rapid keyboard events
 * identical to what a real scanner produces.
 */
import { useState, useRef, useEffect } from 'react'
import { ScanBarcode, X } from 'lucide-react'
import { simulateScan } from '@/hooks/useBarcode'

const SAMPLE_BARCODES = [
  { label: 'Samsung A16',   code: '8806095844701' },
  { label: 'iPhone 15 Case', code: '0194253418481' },
  { label: 'USB-C Cable',   code: '6901443157097' },
  { label: 'Alfa 15.15',    code: 'ALFA-15-TEST01' },
  { label: 'Custom test',   code: 'TEST-PRODUCT-01' },
]

export function BarcodeScanDev() {
  const isDev = import.meta.env.DEV
  const [visible, setVisible]   = useState(isDev)   // always on in dev, off in prod
  const [expanded, setExpanded] = useState(true)
  const [code, setCode]         = useState('')
  const [flash, setFlash]       = useState(false)
  const [lastScan, setLastScan] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // In production, toggle visibility with Ctrl+Shift+B
  useEffect(() => {
    if (isDev) return
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key === 'B') {
        setVisible(v => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isDev])

  if (!visible) return null

  function fire(barcode: string) {
    const clean = barcode.trim()
    if (!clean) return
    setFlash(true)
    setLastScan(clean)
    simulateScan(clean)
    setTimeout(() => setFlash(false), 600)
    setCode('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  return (
    <div className="fixed bottom-4 left-4 z-[9999] font-mono text-xs select-none"
      style={{ width: expanded ? 256 : 42 }}>
      <div className={`rounded-xl border-2 shadow-2xl overflow-hidden transition-all ${
        flash
          ? 'border-green-400 bg-green-50 shadow-green-200'
          : 'border-amber-400 bg-amber-50 shadow-amber-100'
      }`}>

        {/* Header */}
        <button
          onClick={() => setExpanded(e => !e)}
          className="w-full flex items-center gap-2 px-3 py-2.5 text-amber-800 font-bold hover:bg-amber-100 transition-colors"
        >
          <ScanBarcode className="w-4 h-4 shrink-0 text-amber-600" />
          {expanded && (
            <>
              <span className="flex-1 text-left text-[11px] uppercase tracking-widest">
                Scanner Test
              </span>
              {!isDev && (
                <span className="text-[9px] bg-amber-200 text-amber-700 px-1.5 py-0.5 rounded">PROD</span>
              )}
              <X className="w-3 h-3 text-amber-400" onClick={e => { e.stopPropagation(); setVisible(false) }} />
            </>
          )}
        </button>

        {expanded && (
          <div className="px-3 pb-3 space-y-2.5">

            {/* Last scan result */}
            {lastScan && (
              <div className={`text-[10px] px-2 py-1 rounded ${flash ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                {flash ? '✓ Fired:' : 'Last:'} <span className="font-bold">{lastScan}</span>
              </div>
            )}

            {/* Manual entry */}
            <div className="flex gap-1">
              <input
                ref={inputRef}
                value={code}
                onChange={e => setCode(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); fire(code) } }}
                placeholder="Type barcode + Enter"
                className="flex-1 px-2 py-1.5 rounded-lg border border-amber-300 bg-white text-[11px] focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-300"
                autoComplete="off"
              />
              <button
                onClick={() => fire(code)}
                className="px-2.5 py-1 rounded-lg bg-amber-500 text-white hover:bg-amber-600 active:scale-95 transition-all font-bold text-sm"
                title="Simulate scan (Enter)"
              >
                ↵
              </button>
            </div>

            {/* Quick-fire samples */}
            <div className="space-y-0.5">
              <p className="text-[9px] text-amber-500 uppercase tracking-widest px-1">Quick samples</p>
              {SAMPLE_BARCODES.map(s => (
                <button
                  key={s.code}
                  onClick={() => fire(s.code)}
                  className="w-full text-left px-2 py-1 rounded-lg hover:bg-amber-100 active:bg-amber-200 transition-colors flex items-center justify-between gap-2"
                >
                  <span className="text-amber-900 font-medium">{s.label}</span>
                  <span className="text-amber-400 text-[9px] truncate max-w-[90px]">{s.code}</span>
                </button>
              ))}
            </div>

            <p className="text-[9px] text-amber-400 text-center pt-0.5">
              {isDev ? 'DEV MODE' : 'Press Ctrl+Shift+B to hide'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
