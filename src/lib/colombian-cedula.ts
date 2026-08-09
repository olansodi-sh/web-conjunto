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

/** Parses the full structured record (document + names + demographics) when present. */
export function parseColombianCedula(rawText: string): ColombianCedulaData | null {
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
