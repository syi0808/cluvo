import type { DraftPayload, ReporterMode } from '../types.js'
import { buildBrowserUrl, openBrowser } from './browser.js'
import { ghCreate } from './gh-cli.js'
import { apiCreate } from './github-api.js'
import { saveReportFile } from './file-export.js'
import { renderTerminalDraft } from './terminal.js'
import { checkGhInstalled, checkGhAuth, getGithubToken } from './auth.js'
import { join } from 'node:path'

export interface PublishResult {
  method: 'browser' | 'gh' | 'api' | 'file' | 'terminal'
  issueUrl?: string
  filePath?: string
}

export interface PublishOptions {
  repo: string
  mode?: ReporterMode
  fallbackDir?: string
}

export async function publish(draft: DraftPayload, options: PublishOptions): Promise<PublishResult> {
  const chain = buildChain(options.mode ?? 'browser')

  for (const method of chain) {
    try {
      const result = await tryPublish(method, draft, options)
      if (result) return result
    } catch {
      // fall through to next
    }
  }

  // Final fallback: file + terminal (always succeeds)
  return await fileFallback(draft, options)
}

function buildChain(startMode: ReporterMode): ReporterMode[] {
  const all: ReporterMode[] = ['browser', 'gh', 'api', 'file']
  const startIndex = all.indexOf(startMode)
  return all.slice(startIndex)
}

async function tryPublish(
  method: ReporterMode,
  draft: DraftPayload,
  options: PublishOptions,
): Promise<PublishResult | null> {
  switch (method) {
    case 'browser': {
      const url = buildBrowserUrl(draft, options.repo)
      if (!url) return null
      await openBrowser(url)
      return { method: 'browser' }
    }
    case 'gh': {
      if (!(await checkGhInstalled()) || !(await checkGhAuth())) return null
      const issueUrl = await ghCreate(draft, options.repo)
      return { method: 'gh', issueUrl }
    }
    case 'api': {
      const token = getGithubToken()
      if (!token) return null
      const issueUrl = await apiCreate(draft, options.repo, token)
      return { method: 'api', issueUrl }
    }
    case 'file': {
      return await fileFallback(draft, options)
    }
  }
}

async function fileFallback(draft: DraftPayload, options: PublishOptions): Promise<PublishResult> {
  const dir = options.fallbackDir ?? join(process.env.HOME || '.', '.cluvo', 'drafts')
  const filename = `cluvo-report-${Date.now()}.md`
  const filePath = join(dir, filename)
  await saveReportFile(draft, filePath)
  process.stderr.write(renderTerminalDraft(draft))
  return { method: 'file', filePath }
}
