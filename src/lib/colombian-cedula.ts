// Parser for the raw text decoded from a Colombian cedula's PDF417 barcode
// (Registraduria format). Reverse-engineered from real scans: the barcode
// packs several fixed-width fields back to back (a certificate serial, an
// internal software tag "PubDSK_1", the document number, then the names),
// separated by NUL padding - except the serial/document boundary, which has
// no padding when the serial fills its slot exactly. The document number is
// reliably the last 10 characters immediately before the first surname,
// zero-padded on the left when the real number is shorter than 10 digits.

export type ColombianCedulaData = {
  documentNumber: string
  lastName1: string
  lastName2: string
  firstName1: string
  firstName2: string
  sex?: 'M' | 'F'
  birthDate?: string
  bloodType?: string
}

/** Extracts just the document number from decoded cedula barcode text. */
export function extractCedulaDocumentNumber(rawText: string): string | null {
  const firstSurname = rawText.match(/[A-Z]{4,}/)
  if (!firstSurname || firstSurname.index === undefined) return null

  const digitsBeforeSurname = rawText.slice(0, firstSurname.index).replace(/[^0-9]/g, '')
  if (digitsBeforeSurname.length < 6) return null

  return digitsBeforeSurname.slice(-10).replace(/^0+(?=\d)/, '')
}

/**
 * Parses the MRZ (ICAO 9303 TD1, 3 lines x 30 chars) printed on the back of
 * the new Colombian "cedula digital". The scanner delivers the three lines as
 * one run of [A-Z0-9<] separated by CR/LF (sanitized to spaces upstream).
 *
 * Line 1: I<COL + document number (9 + check) + optional field (NUIP overflow)
 * Line 2: birth date YYMMDD + check + sex + expiry + nationality + ...
 * Line 3: SURNAME1<SURNAME2<<GIVEN1<GIVEN2<<<...
 */
export function parseColombianMrz(rawText: string): ColombianCedulaData | null {
  const joined = rawText
    .toUpperCase()
    .split(/\s+/)
    .filter((token) => /^[A-Z0-9<]+$/.test(token))
    .join('')

  const start = joined.search(/I[A-Z0-9<]COL/)
  if (start === -1 || joined.length - start < 90) return null

  const mrz = joined.slice(start, start + 90)
  const line1 = mrz.slice(0, 30)
  const line2 = mrz.slice(30, 60)
  const line3 = mrz.slice(60, 90)

  // Document number: prefer the optional-data field (pos 15+) when the doc
  // field is short; in practice the NUIP is the longest digit run in line 1.
  const digitRuns = [...line1.slice(5).matchAll(/\d{6,}/g)].map((m) => m[0])
  if (digitRuns.length === 0) return null
  const documentNumber = digitRuns
    .reduce((a, b) => (a.length >= b.length ? a : b))
    .slice(0, 10)
    .replace(/^0+(?=\d)/, '')

  // Names: PRIMARY<SECONDARY<<GIVEN1<GIVEN2
  const [surnamePart, givenPart] = line3.split('<<')
  if (!surnamePart || !givenPart) return null
  const surnames = surnamePart.split('<').filter(Boolean)
  const givenNames = givenPart.split('<').filter(Boolean)
  if (surnames.length === 0 || givenNames.length === 0) return null

  const sexChar = line2[7]
  const birth = line2.slice(0, 6)
  const birthYear = parseInt(birth.slice(0, 2), 10)
  // Two-digit year: assume 19xx for years that would land in the future.
  const currentYY = new Date().getFullYear() % 100
  const century = birthYear > currentYY ? '19' : '20'

  return {
    documentNumber,
    lastName1: surnames[0],
    lastName2: surnames[1] ?? '',
    firstName1: givenNames[0],
    firstName2: givenNames[1] ?? '',
    sex: sexChar === 'M' || sexChar === 'F' ? sexChar : undefined,
    birthDate: /^\d{6}$/.test(birth)
      ? `${century}${birth.slice(0, 2)}-${birth.slice(2, 4)}-${birth.slice(4, 6)}`
      : undefined,
  }
}

/** Parses the full structured record (document + names + demographics) when present. */
export function parseColombianCedula(rawText: string): ColombianCedulaData | null {
  const mrz = parseColombianMrz(rawText)
  if (mrz) return mrz

  const nameTokens = [...rawText.matchAll(/[A-Z]{4,}/g)].map((m) => m[0])
  if (nameTokens.length < 4) return null

  const documentNumber = extractCedulaDocumentNumber(rawText)
  if (!documentNumber) return null

  const [lastName1, lastName2, firstName1, firstName2] = nameTokens
  const details = rawText.match(/0([MF])(\d{4})(\d{2})(\d{2})\d*([OAB]{1,2})([+-])/)

  return {
    documentNumber,
    lastName1,
    lastName2,
    firstName1,
    firstName2,
    sex: details?.[1] as 'M' | 'F' | undefined,
    birthDate: details ? `${details[2]}-${details[3]}-${details[4]}` : undefined,
    bloodType: details ? `${details[5]}${details[6]}` : undefined,
  }
}
