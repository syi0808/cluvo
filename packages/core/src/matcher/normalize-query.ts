import type { ErrorPayload } from '../types.js'

export function normalizeQuery(error: ErrorPayload): string {
  const raw = `${error.name}: ${error.message}`

  const cleaned = raw
    // Remove file paths (unix and windows)
    .replace(/[A-Za-z]:\\[\w\\.-]+/g, '')
    .replace(/\/[\w./-]+/g, '')
    // Remove special characters that break GitHub search
    .replace(/[[\]{}()"'`<>]/g, '')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim()

  return cleaned.slice(0, 100)
}
