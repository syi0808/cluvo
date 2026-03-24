import { describe, expect, test } from 'bun:test'
import { SECTION_RENDERERS } from '../src/formatter/sections.js'
import type { ErrorReport } from '../src/types.js'

function makeReport(overrides: Partial<ErrorReport> = {}): ErrorReport {
	return {
		id: 'test-id',
		createdAt: '2026-03-24T10:00:00Z',
		app: { name: 'my-cli', version: '1.0.0', runtime: 'node' },
		error: {
			name: 'TypeError',
			message: 'Cannot read property of undefined',
		},
		environment: { os: 'darwin 23.1.0', arch: 'arm64', runtimeVersion: 'v20.11.0' },
		sanitizedFields: [],
		status: 'pending',
		...overrides,
	}
}

describe('SECTION_RENDERERS', () => {
	describe('summary', () => {
		test('includes error name and message', () => {
			const result = SECTION_RENDERERS.summary(makeReport())
			expect(result).toContain('TypeError')
			expect(result).toContain('Cannot read property of undefined')
		})
	})

	describe('environment', () => {
		test('includes OS, arch, runtime, app name@version', () => {
			const result = SECTION_RENDERERS.environment(makeReport())!
			expect(result).toContain('darwin 23.1.0')
			expect(result).toContain('arm64')
			expect(result).toContain('v20.11.0')
			expect(result).toContain('my-cli@1.0.0')
		})

		test('includes gitSha when present', () => {
			const result = SECTION_RENDERERS.environment(
				makeReport({ app: { name: 'x', version: '1.0.0', runtime: 'node', gitSha: 'abc123' } }),
			)!
			expect(result).toContain('abc123')
		})

		test('includes shell, packageManager, CI when present', () => {
			const result = SECTION_RENDERERS.environment(
				makeReport({
					environment: {
						os: 'linux',
						arch: 'x64',
						runtimeVersion: 'v20',
						shell: '/bin/zsh',
						packageManager: 'pnpm',
						ci: true,
					},
				}),
			)!
			expect(result).toContain('/bin/zsh')
			expect(result).toContain('pnpm')
			expect(result).toContain('CI')
		})
	})

	describe('command', () => {
		test('returns null when no argv', () => {
			const result = SECTION_RENDERERS.command(makeReport())
			expect(result).toBeNull()
		})

		test('includes argv joined', () => {
			const result = SECTION_RENDERERS.command(
				makeReport({ command: { argv: ['deploy', 'prod', '--force'] } }),
			)!
			expect(result).toContain('deploy prod --force')
		})
	})

	describe('stackTrace', () => {
		test('returns null when no stack', () => {
			const result = SECTION_RENDERERS.stackTrace(makeReport())
			expect(result).toBeNull()
		})

		test('renders stack in code block', () => {
			const result = SECTION_RENDERERS.stackTrace(
				makeReport({
					error: { name: 'Error', message: 'fail', stack: 'Error: fail\n  at foo.ts:1:1' },
				}),
			)!
			expect(result).toContain('```')
			expect(result).toContain('at foo.ts:1:1')
		})
	})

	describe('causeChain', () => {
		test('returns null when no causeChain', () => {
			const result = SECTION_RENDERERS.causeChain(makeReport())
			expect(result).toBeNull()
		})

		test('numbers items', () => {
			const result = SECTION_RENDERERS.causeChain(
				makeReport({
					error: { name: 'Error', message: 'top', causeChain: ['mid error', 'root error'] },
				}),
			)!
			expect(result).toContain('1. mid error')
			expect(result).toContain('2. root error')
		})
	})

	describe('sanitizedNotice', () => {
		test('returns null when no sanitized fields', () => {
			const result = SECTION_RENDERERS.sanitizedNotice(makeReport())
			expect(result).toBeNull()
		})

		test('lists field names', () => {
			const result = SECTION_RENDERERS.sanitizedNotice(
				makeReport({ sanitizedFields: ['error.message', 'error.stack'] }),
			)!
			expect(result).toContain('error.message')
			expect(result).toContain('error.stack')
			expect(result).toContain('2 field')
		})
	})
})
