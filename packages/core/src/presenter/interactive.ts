import type { ErrorReport, DraftPayload, ReporterConfig, ExistingIssue } from '../types.js'
import { renderSummary, renderDetails, renderPromptMessage } from './render.js'

export interface PresenterAction {
  type: 'view' | 'react' | 'open' | 'gh' | 'save' | 'cancel'
  issue?: ExistingIssue
}

export async function promptUser(
  report: ErrorReport,
  draft: DraftPayload,
  config: ReporterConfig,
  authAvailable: boolean,
): Promise<PresenterAction | null> {
  const message = renderPromptMessage(config.prompt?.message, config.branding?.showName)
  process.stdout.write(`\n${message} `)

  const confirmed = await readYesNo()
  if (!confirmed) return null

  process.stdout.write('\n' + renderSummary(report, draft) + '\n\n')

  return await promptAction(report, authAvailable)
}

async function promptAction(report: ErrorReport, authAvailable: boolean): Promise<PresenterAction> {
  const hasMatches = (report.matches?.length ?? 0) > 0

  const options: string[] = []
  if (hasMatches) {
    options.push('[v] View similar issue')
    if (authAvailable) options.push('[r] React to issue')
  }
  options.push('[o] Open in browser')
  options.push('[g] Create via gh')
  options.push('[s] Save as markdown')
  options.push('[d] Details')
  options.push('[c] Cancel')

  process.stdout.write(options.join('  ') + '\n')

  const key = await readKey()

  switch (key) {
    case 'v': return { type: 'view', issue: report.matches?.[0] }
    case 'r': return { type: 'react', issue: report.matches?.[0] }
    case 'o': return { type: 'open' }
    case 'g': return { type: 'gh' }
    case 's': return { type: 'save' }
    case 'c': return { type: 'cancel' }
    case 'd': {
      process.stdout.write('\n' + renderDetails(draft) + '\n\n')
      return await promptAction(report, authAvailable)
    }
    default: return { type: 'cancel' }
  }
}

function readYesNo(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      resolve(false)
      return
    }
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.once('data', (data) => {
      process.stdin.setRawMode(false)
      process.stdin.pause()
      const char = data.toString().trim().toLowerCase()
      process.stdout.write(char === 'n' ? 'n\n' : 'Y\n')
      resolve(char !== 'n')
    })
  })
}

function readKey(): Promise<string> {
  return new Promise((resolve) => {
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.once('data', (data) => {
      process.stdin.setRawMode(false)
      process.stdin.pause()
      const char = data.toString().trim().toLowerCase()
      process.stdout.write(char + '\n')
      resolve(char)
    })
  })
}
