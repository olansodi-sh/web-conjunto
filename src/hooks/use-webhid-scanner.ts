import { useCallback, useEffect, useRef, useState } from 'react'
import { extractCedulaDocumentNumber, parseColombianMrz } from '@/lib/colombian-cedula'

const ZEBRA_VENDOR_ID = 0x05e0
const ZEBRA_PRODUCT_ID = 0x1300

export const SCANNER_EVENT = 'zebra:scan'

export type WebHidStatus = 'unsupported' | 'disconnected' | 'connecting' | 'connected' | 'error'

type HidDevice = EventTarget & {
  opened: boolean
  vendorId: number
  productId: number
  open: () => Promise<void>
  close: () => Promise<void>
}

type HidInputReportEvent = Event & {
  data: DataView
}

type HidApi = {
  requestDevice: (options: { filters: Array<{ vendorId: number; productId: number }> }) => Promise<HidDevice[]>
  getDevices: () => Promise<HidDevice[]>
}

declare global {
  interface Navigator {
    hid?: HidApi
  }
}

// A PDF417 payload (Colombian cedula) is much bigger than a single USB HID
// report can carry, so the scanner splits it across several consecutive
// `inputreport` events. Only the FIRST report of a scan carries the SNAPI
// header (byte 0 = msg type, byte 1 = payload length in this report, byte 2
// = symbology); continuation reports are raw payload bytes. Reports for the
// same physical scan arrive within a few ms of each other, so we buffer
// bytes and only finalize/dispatch once no new report has arrived for a
// short quiet period.
const SCAN_FLUSH_QUIET_MS = 120

function sanitizeForUse(bytes: number[]): string {
  // The Colombian cedula PDF417 packs several unrelated fields (a serial
  // number, an internal tag, the actual document number, names...) back to
  // back inside one HID report, separated only by runs of NUL bytes. Those
  // NUL runs MUST become a visible separator (not be deleted) or unrelated
  // numeric fields silently fuse into one bogus digit blob.
  let out = ''
  let inGap = false
  for (const b of bytes) {
    if (b === 0x00 || b === 0x0d || b === 0x0a) {
      if (!inGap) { out += ' '; inGap = true }
      continue
    }
    inGap = false
    if (b >= 0x20 && b <= 0x7e) out += String.fromCharCode(b)
  }
  return out.trim().replace(/ {2,}/g, ' ')
}

// Debug-only decode that keeps structure visible instead of silently
// dropping control bytes, so field separators used by the card issuer show up.
function debugDecode(bytes: number[]): string {
  return bytes
    .map((b) => {
      if (b === 0x1d) return '<GS>'
      if (b === 0x1e) return '<RS>'
      if (b === 0x1f) return '<US>'
      if (b === 0x0d) return '<CR>'
      if (b === 0x0a) return '<LF>'
      if (b === 0x00) return ''
      if (b >= 0x20 && b <= 0x7e) return String.fromCharCode(b)
      return `<${b.toString(16).padStart(2, '0')}>`
    })
    .join('')
}

export function useWebHidScanner() {
  const [status, setStatus] = useState<WebHidStatus>(() =>
    typeof navigator !== 'undefined' && 'hid' in navigator ? 'disconnected' : 'unsupported',
  )
  const deviceRef = useRef<HidDevice | null>(null)
  const bufferRef = useRef<number[]>([])
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback(() => {
    const bytes = bufferRef.current
    bufferRef.current = []
    flushTimerRef.current = null
    if (bytes.length === 0) return

    console.log('[scanner:webhid] full raw bytes:', bytes.map((b) => b.toString(16).padStart(2, '0')).join(' '))
    console.log('[scanner:webhid] full decoded (debug, separators visible):', debugDecode(bytes))

    const barcode = sanitizeForUse(bytes)
    console.log('[scanner:webhid] sanitized value used for search:', JSON.stringify(barcode))
    if (barcode.length >= 4) {
      window.dispatchEvent(new CustomEvent(SCANNER_EVENT, { detail: { value: barcode } }))
    }
  }, [])

  const handleInputReport = useCallback((event: HidInputReportEvent) => {
    const data = new Uint8Array(event.data.buffer)
    const isFirstChunk = bufferRef.current.length === 0
    // Only the first report of a scan carries the 3-byte SNAPI header.
    const start = isFirstChunk && data[0] === 0x04 ? 3 : 0
    for (let i = start; i < data.length; i++) bufferRef.current.push(data[i])

    if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
    flushTimerRef.current = setTimeout(flush, SCAN_FLUSH_QUIET_MS)
  }, [flush])

  const openDevice = useCallback(async (device: HidDevice) => {
    if (!device.opened) await device.open()
    device.addEventListener('inputreport', handleInputReport as EventListener)
    deviceRef.current = device
    setStatus('connected')
  }, [handleInputReport])

  const connect = useCallback(async () => {
    if (!navigator.hid) return
    try {
      setStatus('connecting')
      const devices = await navigator.hid.requestDevice({
        filters: [{ vendorId: ZEBRA_VENDOR_ID, productId: ZEBRA_PRODUCT_ID }],
      })
      const device = devices[0]
      if (!device) { setStatus('disconnected'); return }
      await openDevice(device)
    } catch {
      setStatus('error')
    }
  }, [openDevice])

  // Auto-reconnect to already-permitted device
  useEffect(() => {
    if (!navigator.hid) return

    async function tryAutoConnect() {
      if (!navigator.hid) return
      const devices = await navigator.hid.getDevices()
      const device = devices.find(
        (d) => d.vendorId === ZEBRA_VENDOR_ID && d.productId === ZEBRA_PRODUCT_ID,
      )
      if (device) await openDevice(device).catch(() => setStatus('disconnected'))
    }

    void tryAutoConnect()

    return () => {
      const d = deviceRef.current
      if (d) {
        d.removeEventListener('inputreport', handleInputReport as EventListener)
        void d.close().catch(() => {})
        deviceRef.current = null
      }
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
    }
  }, [openDevice, handleInputReport])

  return { status, connect }
}

/**
 * Extracts the most likely document/ID number from raw barcode data.
 * Tries the Colombian cedula formats first (PDF417 for the old card, MRZ for
 * the new "cedula digital" — see colombian-cedula.ts), then falls back to
 * generic heuristics for other symbologies (1D Code128, cedula de
 * extranjeria, passports, etc).
 *
 * Returns '' when the payload is unreadable binary — notably the QR on the
 * back of the cedula digital, whose ~870 bytes are an encrypted/signed
 * Registraduria blob with no plaintext fields; pulling a digit run out of it
 * yields a bogus document number, so callers must skip empty results.
 */
export function extractDocumentFromBarcode(raw: string): string {
  const trimmed = raw.trim()
  // Already clean: only alphanumeric chars (typical 1D Code128 scan)
  if (/^[A-Za-z0-9]{4,}$/.test(trimmed)) return trimmed

  // New cedula digital: MRZ (TD1) on the back
  const mrz = parseColombianMrz(trimmed)
  if (mrz) return mrz.documentNumber

  const cedulaDocument = extractCedulaDocumentNumber(trimmed)
  if (cedulaDocument) return cedulaDocument

  // Binary payloads survive sanitization as symbol soup; if most of the text
  // is not alphanumeric, refuse instead of letting the digit-run fallback
  // fabricate a document number.
  const alnumCount = (trimmed.match(/[A-Za-z0-9 ]/g) ?? []).length
  if (trimmed.length > 0 && alnumCount / trimmed.length < 0.7) return ''

  // Prefer longest all-digit sequence (Colombian CC = 6-10 digits)
  const digitRuns = [...trimmed.matchAll(/\d{5,15}/g)].map((m) => m[0])
  if (digitRuns.length > 0) return digitRuns.reduce((a, b) => (a.length >= b.length ? a : b))

  // Fallback: longest alphanumeric run (passport-style)
  const alphaRuns = [...trimmed.matchAll(/[A-Za-z0-9]{4,}/g)].map((m) => m[0])
  if (alphaRuns.length > 0) return alphaRuns.reduce((a, b) => (a.length >= b.length ? a : b))

  return trimmed
}

/** Subscribe to scan events from the Zebra scanner (or keyboard wedge fallback) */
export function useScanInput(onScan: (value: string) => void, enabled = true) {
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan

  useEffect(() => {
    if (!enabled) return
    function handler(e: Event) {
      const value = (e as CustomEvent<{ value: string }>).detail?.value
      if (value) onScanRef.current(value)
    }
    window.addEventListener(SCANNER_EVENT, handler)
    return () => window.removeEventListener(SCANNER_EVENT, handler)
  }, [enabled])
}
