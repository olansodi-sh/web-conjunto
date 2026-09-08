import { useEffect, useState } from 'react'

/**
 * Devuelve el valor recibido tras `delay` ms sin cambios. Útil para no disparar
 * una consulta por cada tecla mientras el usuario escribe.
 */
export function useDebouncedValue<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
