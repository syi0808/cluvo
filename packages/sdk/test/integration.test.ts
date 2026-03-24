import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from '@cluvo/core'
import type { InternalConfig } from '../src/config.js'
import { createReporter } from '../src/reporter.js'

describe('Full pipeline integration', () => {
	let storeDir: string

	beforeEach(async () => {
		storeDir = await mkdtemp(join(tmpdir(), 'cluvo-int-'))
	})
	afterEach(async () => {
		await rm(storeDir, { recursive: true, force: true })
	})

	test('error → collect → sanitize → store → draft', async () => {
		const reporter = createReporter({
			repo: 'owner/repo',
			app: { name: 'test-cli', version: '2.0.0', gitSha: 'abc123' },
			store: { enabled: true },
			sanitize: { enabled: true },
			interactive: 'never',
			nonInteractive: 'silent',
			_storeDir: storeDir,
		} satisfies InternalConfig)

		// Simulate error with sensitive data
		const error = new Error('Connection failed: api_key=sk_live_secret123')

		// Step 1: reportError (collect + sanitize + store)
		const report = await reporter.reportError(error, {
			command: 'deploy',
			argv: ['deploy', '--token', 'ghp_mysecret', '--verbose'],
		})

		// Verify report
		expect(report.error.name).toBe('Error')
		expect(report.error.message).not.toContain('sk_live_secret123')
		expect(report.command?.argv).not.toContain('ghp_mysecret')
		expect(report.app.gitSha).toBe('abc123')
		expect(report.environment.os).toBeTruthy()

		// Verify stored
		const store = new Store(storeDir)
		const stored = await store.list('test-cli')
		expect(stored).toHaveLength(1)
		expect(stored[0].id).toBe(report.id)

		// Step 2: build draft
		const draft = reporter.buildDraft(report)
		expect(draft.title).toContain('deploy')
		expect(draft.title).toContain('Error')
		expect(draft.body).toContain('## Environment')
		expect(draft.body).toContain('test-cli@2.0.0')
		expect(draft.body).not.toContain('sk_live_secret123')
	})

	test('wrapCommand catches error and stores report', async () => {
		const reporter = createReporter({
			repo: 'owner/repo',
			app: { name: 'wrap-test', version: '1.0.0' },
			store: { enabled: true },
			interactive: 'never',
			nonInteractive: 'silent',
			_storeDir: storeDir,
		} satisfies InternalConfig)

		let thrown = false
		try {
			await reporter.wrapCommand(async () => {
				throw new Error('command failed')
			})
		} catch {
			thrown = true
		}

		expect(thrown).toBe(true)

		const store = new Store(storeDir)
		const stored = await store.list('wrap-test')
		expect(stored).toHaveLength(1)
		expect(stored[0].error.message).toBe('command failed')
	})
})
