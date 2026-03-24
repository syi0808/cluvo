import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { PresenterAction } from '../src/presenter/interactive.js'
import type { DraftPayload, ErrorReport, ReporterConfig } from '../src/types.js'

const report: ErrorReport = {
	id: 'r1',
	createdAt: new Date().toISOString(),
	error: { name: 'Error', message: 'test' },
	environment: { os: 'darwin', arch: 'arm64', runtimeVersion: 'v20.0.0' },
	app: { name: 'test-app', version: '1.0.0', runtime: 'node' },
	sanitizedFields: [],
	command: { argv: ['build'] },
	status: 'pending',
}
const draft: DraftPayload = { title: 'Error: test', body: '## Summary\n\ntest' }
const config: ReporterConfig = { repo: 'owner/repo', app: { name: 'test-app', version: '1.0.0' } }

let keypressQueue: string[] = []

const origIsTTY = process.stdin.isTTY
const origSetRawMode = process.stdin.setRawMode
const origResume = process.stdin.resume
const origPause = process.stdin.pause
const origStdinOnce = process.stdin.once
const origStdoutWrite = process.stdout.write

function queueKeys(...keys: string[]) {
	keypressQueue.push(...keys)
}

describe('promptUser', () => {
	beforeEach(() => {
		keypressQueue = []
		Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
		process.stdin.setRawMode = mock(() => process.stdin)
		process.stdin.resume = mock(() => process.stdin)
		process.stdin.pause = mock(() => process.stdin)
		process.stdin.once = mock((event: string, cb: (data: Buffer) => void) => {
			if (event === 'data' && keypressQueue.length > 0) {
				const key = keypressQueue.shift()!
				queueMicrotask(() => cb(Buffer.from(key)))
			}
			return process.stdin
		}) as typeof process.stdin.once
		process.stdout.write = mock(() => true) as typeof process.stdout.write
	})

	afterEach(() => {
		Object.defineProperty(process.stdin, 'isTTY', { value: origIsTTY, configurable: true })
		process.stdin.setRawMode = origSetRawMode
		process.stdin.resume = origResume
		process.stdin.pause = origPause
		Object.defineProperty(process.stdin, 'once', { value: origStdinOnce, configurable: true })
		process.stdout.write = origStdoutWrite
	})

	async function loadPromptUser() {
		const mod = await import('../src/presenter/interactive.js')
		return mod.promptUser
	}

	test('returns null when stdin is not TTY', async () => {
		Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })
		const promptUser = await loadPromptUser()
		const result = await promptUser(report, draft, config, false)
		expect(result).toBeNull()
	})

	test('returns null when user presses n', async () => {
		queueKeys('n')
		const promptUser = await loadPromptUser()
		const result = await promptUser(report, draft, config, false)
		expect(result).toBeNull()
	})

	test('returns open action when user presses y then o', async () => {
		queueKeys('y', 'o')
		const promptUser = await loadPromptUser()
		const result = await promptUser(report, draft, config, false)
		expect(result).toEqual({ type: 'open' } as PresenterAction)
	})

	test('returns gh action when user presses y then g', async () => {
		queueKeys('y', 'g')
		const promptUser = await loadPromptUser()
		const result = await promptUser(report, draft, config, false)
		expect(result).toEqual({ type: 'gh' } as PresenterAction)
	})

	test('returns save action when user presses y then s', async () => {
		queueKeys('y', 's')
		const promptUser = await loadPromptUser()
		const result = await promptUser(report, draft, config, false)
		expect(result).toEqual({ type: 'save' } as PresenterAction)
	})

	test('returns cancel action when user presses y then c', async () => {
		queueKeys('y', 'c')
		const promptUser = await loadPromptUser()
		const result = await promptUser(report, draft, config, false)
		expect(result).toEqual({ type: 'cancel' } as PresenterAction)
	})

	test('returns view action with issue when matches exist and user presses y then v', async () => {
		const issue = {
			type: 'issue',
			number: 1,
			title: 'dup',
			url: 'https://github.com/x/y/issues/1',
			state: 'open',
			labels: [],
			createdAt: '2026-01-01',
		}
		const reportWithMatches = { ...report, matches: [issue] }
		queueKeys('y', 'v')
		const promptUser = await loadPromptUser()
		const result = await promptUser(reportWithMatches, draft, config, false)
		expect(result).toEqual({ type: 'view', issue } as PresenterAction)
	})

	test('shows details then re-prompts when user presses d then c', async () => {
		queueKeys('y', 'd', 'c')
		const promptUser = await loadPromptUser()
		const result = await promptUser(report, draft, config, false)
		expect(result).toEqual({ type: 'cancel' } as PresenterAction)
		const writeCall = process.stdout.write as ReturnType<typeof mock>
		const written = writeCall.mock.calls.map((c: unknown[]) => c[0]).join('')
		expect(written).toContain('## Summary')
	})
})
