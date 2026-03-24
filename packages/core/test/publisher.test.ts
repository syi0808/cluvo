import { describe, expect, test, mock, spyOn, beforeEach, afterEach } from 'bun:test'
import { buildBrowserUrl } from '../src/publisher/browser.js'
import { buildGhArgs } from '../src/publisher/gh-cli.js'
import { saveReportFile } from '../src/publisher/file-export.js'
import { renderTerminalDraft } from '../src/publisher/terminal.js'
import { publish } from '../src/publisher/publish.js'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { DraftPayload } from '../src/types.js'

const draft: DraftPayload = {
  title: 'Test Error',
  body: '## Summary\n\nTest error body',
  labels: ['bug'],
}

describe('browser publisher', () => {
  test('builds prefill URL', () => {
    const url = buildBrowserUrl(draft, 'owner/repo')
    expect(url).toContain('https://github.com/owner/repo/issues/new')
    expect(url).toContain('title=')
    expect(url).toContain('body=')
  })

  test('returns null when URL exceeds 8000 chars', () => {
    const longDraft = { ...draft, body: 'x'.repeat(8000) }
    const url = buildBrowserUrl(longDraft, 'owner/repo')
    expect(url).toBeNull()
  })
})

describe('gh-cli publisher', () => {
  test('builds correct args', () => {
    const args = buildGhArgs(draft, 'owner/repo')
    expect(args).toContain('issue')
    expect(args).toContain('create')
    expect(args).toContain('--repo')
    expect(args).toContain('owner/repo')
    expect(args).toContain('--title')
    expect(args).toContain('Test Error')
  })
})

describe('file export', () => {
  let tmpDir: string
  beforeEach(async () => { tmpDir = await mkdtemp(join(tmpdir(), 'cluvo-pub-')) })
  afterEach(async () => { await rm(tmpDir, { recursive: true, force: true }) })

  test('saves markdown file', async () => {
    const path = join(tmpDir, 'report.md')
    await saveReportFile(draft, path, 'markdown')
    const content = await readFile(path, 'utf-8')
    expect(content).toContain('# Test Error')
    expect(content).toContain('Test error body')
  })

  test('saves json file', async () => {
    const path = join(tmpDir, 'report.json')
    await saveReportFile(draft, path, 'json')
    const content = JSON.parse(await readFile(path, 'utf-8'))
    expect(content.title).toBe('Test Error')
  })
})

describe('terminal publisher', () => {
  test('renders draft for terminal', () => {
    const output = renderTerminalDraft(draft)
    expect(output).toContain('Test Error')
    expect(output).toContain('Test error body')
  })
})

describe('publish fallback chain', () => {
  test('falls through to file export when all remote methods fail', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'cluvo-chain-'))
    try {
      const result = await publish(draft, {
        repo: 'owner/repo',
        mode: 'gh',
        fallbackDir: tmpDir,
      })
      expect(result.method).toBe('file')
      expect(result.filePath).toBeTruthy()
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
  })
})
