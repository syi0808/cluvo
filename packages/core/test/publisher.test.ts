import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildBrowserUrl, openBrowser } from '../src/publisher/browser.js'
import { saveReportFile } from '../src/publisher/file-export.js'
import { buildGhArgs, ghCreate } from '../src/publisher/gh-cli.js'
import { publish } from '../src/publisher/publish.js'
import { renderTerminalDraft } from '../src/publisher/terminal.js'
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
	beforeEach(async () => {
		tmpDir = await mkdtemp(join(tmpdir(), 'cluvo-pub-'))
	})
	afterEach(async () => {
		await rm(tmpDir, { recursive: true, force: true })
	})

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

describe('browser publisher extended', () => {
	test('includes labels param when labels present', () => {
		const url = buildBrowserUrl(draft, 'owner/repo')!
		expect(url).toContain('labels=bug')
	})

	test('omits labels param when labels empty', () => {
		const noLabelsDraft = { ...draft, labels: [] }
		const url = buildBrowserUrl(noLabelsDraft, 'owner/repo')!
		expect(url).not.toContain('labels=')
	})
})

describe('gh-cli publisher extended', () => {
	test('includes --label for each label', () => {
		const multiLabelDraft = { ...draft, labels: ['bug', 'cluvo-report'] }
		const args = buildGhArgs(multiLabelDraft, 'owner/repo')
		const labelIndices = args.reduce<number[]>(
			(acc, a, i) => (a === '--label' ? [...acc, i] : acc),
			[],
		)
		expect(labelIndices).toHaveLength(2)
		expect(args[labelIndices[0] + 1]).toBe('bug')
		expect(args[labelIndices[1] + 1]).toBe('cluvo-report')
	})
})

describe('openBrowser', () => {
	test('resolves when opening valid URL', async () => {
		// openBrowser uses platform command (open/xdg-open/start)
		// On macOS 'open' succeeds for valid URLs
		await expect(openBrowser('https://example.com')).resolves.toBeUndefined()
	})
})

describe('ghCreate', () => {
	test('rejects when gh is not available', async () => {
		// gh issue create with invalid repo will fail
		expect(ghCreate({ title: 'test', body: 'test' }, 'invalid')).rejects.toThrow()
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

	test('mode=browser falls through to file when URL too long', async () => {
		const tmpDir = await mkdtemp(join(tmpdir(), 'cluvo-chain2-'))
		try {
			const longDraft = { ...draft, body: 'x'.repeat(8000) }
			const result = await publish(longDraft, {
				repo: 'owner/repo',
				mode: 'browser',
				fallbackDir: tmpDir,
			})
			expect(result.method).toBe('file')
			expect(result.filePath).toBeTruthy()
		} finally {
			await rm(tmpDir, { recursive: true, force: true })
		}
	})

	test('mode=api falls through when no token', async () => {
		const savedToken = process.env.GITHUB_TOKEN
		const savedGhToken = process.env.GH_TOKEN
		delete process.env.GITHUB_TOKEN
		delete process.env.GH_TOKEN
		const tmpDir = await mkdtemp(join(tmpdir(), 'cluvo-chain3-'))
		try {
			const result = await publish(draft, {
				repo: 'owner/repo',
				mode: 'api',
				fallbackDir: tmpDir,
			})
			expect(result.method).toBe('file')
		} finally {
			if (savedToken !== undefined) process.env.GITHUB_TOKEN = savedToken
			if (savedGhToken !== undefined) process.env.GH_TOKEN = savedGhToken
			await rm(tmpDir, { recursive: true, force: true })
		}
	})
})
