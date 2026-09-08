import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Zona horaria del conjunto. Todo lo que se muestra en la web va en hora de
 * Colombia (GMT-5) sin importar la zona del equipo desde el que se abra: un
 * administrador viajando no debe ver los accesos corridos. Colombia no aplica
 * horario de verano, asi que America/Bogota es siempre UTC-5.
 */
export const APP_TIME_ZONE = 'America/Bogota'
const APP_UTC_OFFSET = '-05:00'

// Toda hora visible en la web va en formato 24h ("horario militar"): 00:30, 09:05,
// 15:45. Se usa hourCycle 'h23' en vez de hour12:false porque este ultimo puede
// devolver "24:30" para la medianoche en algunos motores; h23 siempre da "00:30".
// Los componentes se declaran uno a uno (en vez de dateStyle/timeStyle) porque
// hourCycle no siempre se respeta al combinarlo con timeStyle.
const DATE_TIME_FORMAT = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: APP_TIME_ZONE,
})

const DATE_ONLY_FORMAT = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: APP_TIME_ZONE,
})

const TIME_ONLY_FORMAT = new Intl.DateTimeFormat('es-CO', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: APP_TIME_ZONE,
})

/**
 * `new Date('2026-07-11')` se interpreta como medianoche UTC, que al mostrarse en
 * GMT-5 cae el dia anterior ("10/07/2026"). Un valor date-only no representa un
 * instante sino un dia del calendario, asi que se ancla a la medianoche de Bogota
 * para que el dia mostrado sea siempre el guardado, se abra desde donde se abra.
 */
function parseDateValue(value: string | Date): Date {
  if (typeof value !== 'string') return value

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00${APP_UTC_OFFSET}`)
  }

  return new Date(value)
}

// Formateador auxiliar para leer las partes de una fecha YA en GMT-5. Se usa en
// los calculos (agrupar por dia, contar por hora), no para mostrar: hacerlo con
// getDate()/getHours() usaria la zona del equipo y correria los datos.
const PARTS_FORMAT = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: APP_TIME_ZONE,
})

function bogotaParts(value: string | Date) {
  const parts = PARTS_FORMAT.formatToParts(parseDateValue(value))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  }
}

/**
 * Valor para un `<input type="datetime-local">` expresado en hora de Colombia:
 * "YYYY-MM-DDTHH:mm". El input no maneja zonas, muestra el texto tal cual, asi
 * que alimentarlo con `toISOString()` hacia ver la hora corrida 5 horas.
 */
export function toDateTimeLocalValue(value?: string | Date | null): string {
  const date = value ? parseDateValue(value) : new Date()
  if (Number.isNaN(date.getTime())) return ''
  const { year, month, day, hour, minute } = bogotaParts(date)
  return `${year}-${month}-${day}T${hour}:${minute}`
}

/** Lee el valor de un `<input type="datetime-local">` COMO hora de Colombia y lo pasa a ISO. */
export function fromDateTimeLocalValue(value: string): string {
  const withSeconds = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00` : value
  return new Date(`${withSeconds}${APP_UTC_OFFSET}`).toISOString()
}

/**
 * Dia calendario colombiano de un instante, como "YYYY-MM-DD".
 * Sustituye a `.slice(0, 10)` sobre el ISO, que devuelve el dia UTC: un ingreso
 * de las 20:00 en Colombia es del dia siguiente en UTC y se agrupaba mal.
 */
export function toDayKey(value?: string | Date | null): string {
  if (!value) return ''
  const date = parseDateValue(value)
  if (Number.isNaN(date.getTime())) return ''
  const { year, month, day } = bogotaParts(date)
  return `${year}-${month}-${day}`
}

/** Dia de hoy en Colombia, como "YYYY-MM-DD". */
export function todayKey(): string {
  return toDayKey(new Date())
}

/** Hora (0-23) de un instante en Colombia. Sustituye a `getHours()`. */
export function getHourOfDay(value?: string | Date | null): number {
  if (!value) return -1
  const date = parseDateValue(value)
  if (Number.isNaN(date.getTime())) return -1
  return Number(bogotaParts(date).hour)
}

/** Fecha con hora en 24h si el valor la trae; solo fecha si no. */
export function formatDate(value?: string | Date | null) {
  if (!value) return 'Sin dato'

  const date = parseDateValue(value)
  if (Number.isNaN(date.getTime())) return 'Sin dato'

  const hasTime = typeof value === 'string' ? value.includes('T') : true
  return (hasTime ? DATE_TIME_FORMAT : DATE_ONLY_FORMAT).format(date)
}

/** Solo la fecha, sin hora: 27/07/2026 */
export function formatDateOnly(value?: string | Date | null) {
  if (!value) return 'Sin dato'
  const date = parseDateValue(value)
  if (Number.isNaN(date.getTime())) return 'Sin dato'
  return DATE_ONLY_FORMAT.format(date)
}

/** Solo la hora en 24h: 00:30, 09:05, 15:45. Acepta ISO o "HH:MM[:SS]". */
export function formatTime(value?: string | Date | null) {
  if (!value) return '—'

  // Los campos `time` de Postgres llegan como "15:45:00": ya estan en 24h.
  if (typeof value === 'string' && /^\d{2}:\d{2}/.test(value)) return value.slice(0, 5)

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return TIME_ONLY_FORMAT.format(date)
}

/** Capitaliza la primera letra de cada palabra (title case) para nombres de personas. */
export function toNameCase(str: string | null | undefined): string {
  if (!str) return ''
  return str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Formatea nombre completo de una persona en title case. */
export function formatName(name?: string | null, lastName?: string | null): string {
  return toNameCase([name, lastName].filter(Boolean).join(' '))
}

/** Normaliza placa colombiana: trim, mayúsculas, espacio en posición 3 para placas de 6 chars. */
export function normalizePlate(value?: string | null): string {
  if (!value) return ''
  const cleaned = value.replace(/\s+/g, '').toUpperCase().trim()
  if (cleaned.length === 6) return `${cleaned.slice(0, 3)} ${cleaned.slice(3)}`
  return cleaned
}

/** Formatea un documento con puntos de miles: 1005108571 → 1.005.108.571 */
export function formatDocument(doc?: string | null): string {
  if (!doc) return '—'
  const digits = doc.replace(/\D/g, '')
  if (!digits || digits.length <= 3) return doc
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}
