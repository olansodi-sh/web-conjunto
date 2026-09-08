import { useEffect, useRef } from 'react'
import { SCANNER_EVENT } from './use-webhid-scanner'

// Keyboard-wedge fallback: fires the same SCANNER_EVENT as useWebHidScanner
// so components only need to listen to one event source.
export function useBarcodeScanner(minLength = 4, maxGapMs = 100) {
  const bufferRef = useRef<string[]>([])
  const lastKeyTimeRef = useRef<number>(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const now = Date.now()
      const gap = now - lastKeyTimeRef.current
      lastKeyTimeRef.current = now

      if (gap > maxGapMs) bufferRef.current = []

      if (e.key === 'Enter') {
        const scanned = bufferRef.current.join('')
        bufferRef.current = []
        if (scanned.length >= minLength) {
          console.log('[scanner:keyboard-wedge] raw value:', JSON.stringify(scanned))
          window.dispatchEvent(new CustomEvent(SCANNER_EVENT, { detail: { value: scanned } }))
        }
        return
      }

      if (e.key.length === 1) bufferRef.current.push(e.key)

      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => { bufferRef.current = [] }, maxGapMs * 3)
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [minLength, maxGapMs])
}
