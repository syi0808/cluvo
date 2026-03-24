import type { DraftPayload } from '../types.js'
import { execFile } from 'node:child_process'

const MAX_URL_LENGTH = 8000

export function buildBrowserUrl(draft: DraftPayload, repo: string): string | null {
  const params = new URLSearchParams()
  params.set('title', draft.title)
  params.set('body', draft.body)
  if (draft.labels?.length) params.set('labels', draft.labels.join(','))

  const url = `https://github.com/${repo}/issues/new?${params.toString()}`
  if (url.length > MAX_URL_LENGTH) return null
  return url
}

export async function openBrowser(url: string): Promise<void> {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
  return new Promise((resolve, reject) => {
    execFile(cmd, [url], (error) => {
      if (error) reject(new Error(`Failed to open browser: ${error.message}`))
      else resolve()
    })
  })
}
