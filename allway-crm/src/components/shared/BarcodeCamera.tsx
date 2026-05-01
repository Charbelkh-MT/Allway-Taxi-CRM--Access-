/**
 * BarcodeCamera — webcam-based barcode scanner
 *
 * Uses @zxing/browser to read barcodes from the device camera.
 * Opens as a modal dialog. Works on:
 *   - Laptop webcam (stock desk without a physical scanner)
 *   - Phone camera (open CRM in mobile browser → tap Scan)
 *
 * When a barcode is detected it calls onScan() and closes automatically.
 */
import { useEffect, useRef, useState, useCallback, useLayoutEffect } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { NotFoundException } from '@zxing/library'
import { Camera, X, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface BarcodeCameraProps {
  onScan: (barcode: string) => void
  /** Button label — defaults to "Scan with camera" */
  label?: string
  /** Shown next to the button in smaller text */
  hint?: string
  /** Extra classes on the trigger button */
  className?: string
}

export function BarcodeCamera({ onScan, label = 'Scan with camera', hint, className }: BarcodeCameraProps) {
  const [open, setOpen]         = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [retryKey, setRetryKey] = useState(0)
  const videoRef                = useRef<HTMLVideoElement>(null)
  const readerRef               = useRef<BrowserMultiFormatReader | null>(null)
  const controlsRef             = useRef<any>(null)
  // Keep a stable ref to onScan so the camera effect never re-runs when the parent re-renders
  const onScanRef               = useRef(onScan)
  useLayoutEffect(() => { onScanRef.current = onScan }, [onScan])

  const stopScanner = useCallback(() => {
    try {
      controlsRef.current?.stop()
      controlsRef.current = null
    } catch { /* ignore */ }
    setScanning(false)
  }, [])

  useEffect(() => {
    if (!open) { stopScanner(); return }

    let mounted = true
    setError(null)
    setScanning(true)

    const reader = new BrowserMultiFormatReader()
    readerRef.current = reader

    async function startScanning() {
      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices()
        if (!devices.length) throw new Error('No camera found on this device.')

        // Prefer rear camera on mobile (environment facing)
        const preferred = devices.find(d =>
          d.label.toLowerCase().includes('back') ||
          d.label.toLowerCase().includes('rear') ||
          d.label.toLowerCase().includes('environment')
        ) ?? devices[0]

        if (!mounted || !videoRef.current) return

        const controls = await reader.decodeFromVideoDevice(
          preferred.deviceId,
          videoRef.current,
          (result, err) => {
            if (!mounted) return
            if (result) {
              const code = result.getText()
              stopScanner()
              setOpen(false)
              onScanRef.current(code)
            }
            if (err && !(err instanceof NotFoundException)) {
              console.warn('Scan error:', err)
            }
          }
        )
        controlsRef.current = controls
        if (mounted) setScanning(false)
      } catch (e: any) {
        if (mounted) {
          setError(e.message ?? 'Camera access denied. Check browser permissions.')
          setScanning(false)
        }
      }
    }

    startScanning()
    return () => { mounted = false; stopScanner() }
  // retryKey triggers a camera restart when the user hits "Try again"
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, retryKey, stopScanner])

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          className={`gap-2 ${className ?? ''}`}
        >
          <Camera className="w-4 h-4" />
          {label}
        </Button>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>

      <Dialog open={open} onOpenChange={(o) => { if (!o) stopScanner(); setOpen(o) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="w-4 h-4" />
              Point camera at barcode
            </DialogTitle>
          </DialogHeader>

          <div className="relative rounded-lg overflow-hidden bg-black aspect-[4/3]">
            {/* Video feed */}
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline
              muted
            />

            {/* Scanning overlay with target rectangle */}
            {!error && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="relative w-3/4 h-1/3">
                  {/* Corner brackets */}
                  <div className="absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2 border-white" />
                  <div className="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 border-white" />
                  <div className="absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2 border-white" />
                  <div className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-white" />
                  {/* Scan line animation */}
                  <div className="absolute inset-x-0 top-1/2 h-0.5 bg-red-400 opacity-80 animate-pulse" />
                </div>
              </div>
            )}

            {/* Loading state */}
            {scanning && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <div className="text-white text-center space-y-2">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto" />
                  <p className="text-sm">Starting camera…</p>
                </div>
              </div>
            )}

            {/* Error state */}
            {error && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4">
                <div className="text-center text-white space-y-3">
                  <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
                  <p className="text-sm">{error}</p>
                  <Button size="sm" variant="secondary" onClick={() => { setError(null); setRetryKey(k => k + 1) }}>
                    Try again
                  </Button>
                </div>
              </div>
            )}
          </div>

          <p className="text-xs text-center text-muted-foreground">
            Hold the barcode steady inside the frame. Scans automatically.
          </p>

          <Button variant="ghost" size="sm" onClick={() => { stopScanner(); setOpen(false) }} className="gap-2">
            <X className="w-4 h-4" /> Cancel
          </Button>
        </DialogContent>
      </Dialog>
    </>
  )
}
