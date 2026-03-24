import { describe, expect, test } from 'bun:test'
import { handleNonInteractive } from '../src/presenter/noninteractive.js'
import { renderDetails, renderSummary } from '../src/presenter/render.js'
import type { DraftPayload, ErrorReport, ExistingIssue } from '../src/types.js'

function makeReport(overrides: Partial<ErrorReport> = {}): ErrorReport {
	return {
		id: 'test-id',
		createdAt: '2026-03-24T10:00:00Z',
		app: { name: 'my-cli', version: '1.0.0', runtime: 'node' },
		error: {
			name: 'TypeError',
			message: 'Cannot read property of undefined',
			stack: 'TypeError: Cannot read property of undefined\n  at foo (src/foo.ts:10:5)',
		},
		environment: { os: 'darwin 23.1.0', arch: 'arm64', runtimeVersion: 'v20.11.0' },
		command: { command: 'deploy', subcommand: 'prod', argv: ['deploy', 'prod'] },
		sanitizedFields: ['error.stack', 'command.argv'],
		status: 'pending',
		...overrides,
	}
}

const draft: DraftPayload = {
	title: '[deploy] TypeError: Cannot read property of undefined',
	body: '## Summary\n\nTest body',
}

describe('renderSummary', () => {
	test('shows title, env summary, command, sanitized count', () => {
		const output = renderSummary(makeReport(), draft)
		expect(output).toContain('[deploy] TypeError')
		expect(output).toContain('darwin')
		expect(output).toContain('arm64')
		expect(output).toContain('v20.11.0')
		expect(output).toContain('deploy prod')
		expect(output).toContain('2 field')
	})

	test('shows similar issues when present', () => {
		const matches: ExistingIssue[] = [
			{
				type: 'issue',
				number: 142,
				title: 'Same error',
				url: 'https://github.com/x/y/issues/142',
				state: 'open',
				labels: [],
				createdAt: '2026-01-01',
			},
		]
		const output = renderSummary(makeReport({ matches }), draft)
		expect(output).toContain('#142')
		expect(output).toContain('Same error')
	})
})

describe('renderDetails', () => {
	test('shows full draft body', () => {
		const output = renderDetails(draft)
		expect(output).toContain('## Summary')
		expect(output).toContain('Test body')
	})
})

describe('handleNonInteractive', () => {
	test('save mode writes path to stdout', () => {
		const chunks: string[] = []
		const origWrite = process.stdout.write
		process.stdout.write = ((chunk: string) => {
			chunks.push(chunk)
			return true
		}) as typeof process.stdout.write
		handleNonInteractive(makeReport(), 'save', '/tmp/report.json')
		process.stdout.write = origWrite
		expect(chunks.join('')).toContain('/tmp/report.json')
	})

	test('log mode writes to stderr', () => {
		const chunks: string[] = []
		const origWrite = process.stderr.write
		process.stderr.write = ((chunk: string) => {
			chunks.push(chunk)
			return true
		}) as typeof process.stdout.write
		handleNonInteractive(makeReport(), 'log', '/tmp/report.json')
		process.stderr.write = origWrite
		expect(chunks.join('')).toContain('/tmp/report.json')
	})

	test('silent mode produces no output', () => {
		const chunks: string[] = []
		const origStdout = process.stdout.write
		const origStderr = process.stderr.write
		process.stdout.write = ((chunk: string) => {
			chunks.push(chunk)
			return true
		}) as typeof process.stdout.write
		process.stderr.write = ((chunk: string) => {
			chunks.push(chunk)
			return true
		}) as typeof process.stdout.write
		handleNonInteractive(makeReport(), 'silent', '/tmp/report.json')
		process.stdout.write = origStdout
		process.stderr.write = origStderr
		expect(chunks).toHaveLength(0)
	})
})
