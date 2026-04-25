// RFC 4180 CSV encode/decode for DataPoint rows.
// Fixed schema: id,asset_id,year_month,value,notes,created_at,updated_at
// Handles quoted fields (commas / newlines in notes), double-quote escaping.

import type { DataPoint } from '../models/index.js'

const HEADER = 'id,asset_id,year_month,value,notes,created_at,updated_at'

function quoteField(v: string): string {
  if (/[,"\r\n]/.test(v)) return '"' + v.replace(/"/g, '""') + '"'
  return v
}

// Character-by-character RFC 4180 state machine.
// Correctly handles: quoted fields, embedded commas, embedded newlines, escaped double-quotes.
function parseCsvRows(raw: string): string[][] {
  const rows: string[][] = []
  let fields: string[] = []
  let field = ''
  let inQuotes = false
  const n = raw.length

  for (let i = 0; i < n; i++) {
    const ch = raw[i]
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < n && raw[i + 1] === '"') {
          field += '"'
          i++ // consume escaped quote
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        fields.push(field)
        field = ''
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && i + 1 < n && raw[i + 1] === '\n') i++ // CRLF
        fields.push(field)
        rows.push(fields)
        fields = []
        field = ''
      } else {
        field += ch
      }
    }
  }
  // Last record — file may not end with newline
  if (field !== '' || fields.length > 0) {
    fields.push(field)
    rows.push(fields)
  }
  return rows
}

export function encodeDataPoints(points: DataPoint[]): string {
  const lines: string[] = [HEADER]
  for (const p of points) {
    lines.push([
      p.id,
      p.asset_id,
      p.year_month,
      String(p.value),
      quoteField(p.notes ?? ''),
      p.created_at,
      p.updated_at,
    ].join(','))
  }
  return lines.join('\n') + '\n'
}

export function decodeDataPoints(raw: string): DataPoint[] {
  const trimmed = raw.trim()
  if (!trimmed) return []

  const rows = parseCsvRows(trimmed)
  if (rows.length === 0) return []

  const [headerRow, ...dataRows] = rows
  if (headerRow.join(',') !== HEADER) {
    throw new Error(
      `Unexpected CSV header: expected "${HEADER}", got "${headerRow.join(',')}"`,
    )
  }

  return dataRows
    .filter(fields => fields.length === 7)
    .map(fields => {
      const [id, asset_id, year_month, value, notes, created_at, updated_at] = fields
      const dp: DataPoint = { id, asset_id, year_month, value: Number(value), created_at, updated_at }
      if (notes !== '') dp.notes = notes
      return dp
    })
}
