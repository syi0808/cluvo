import { describe, expect, test } from 'bun:test'
import {
	isUserCancellation,
	isUserCancellationExitCode,
} from '../src/collector/user-cancellation.js'

describe('isUserCancellation', () => {
	test('detects SIGINT-style cancellation values', () => {
		expect(isUserCancellation(130)).toBe(true)
		expect(isUserCancellation('130')).toBe(true)
		expect(isUserCancellation('SIGINT')).toBe(true)
		expect(isUserCancellation({ code: 'SIGINT' })).toBe(true)
		expect(isUserCancellation({ signal: 'SIGINT' })).toBe(true)
		expect(isUserCancellation({ exitCode: 130 })).toBe(true)
	})

	test('detects common cancellation error names and messages', () => {
		const abort = new Error('The operation aborted')
		abort.name = 'AbortError'
		const prompt = new Error('Prompt cancelled.')
		prompt.name = 'PromptCancelledError'

		expect(isUserCancellation(abort)).toBe(true)
		expect(isUserCancellation(prompt)).toBe(true)
		expect(isUserCancellation(new Error('keyboard interrupt'))).toBe(true)
		expect(isUserCancellation(new Error('operation aborted'))).toBe(true)
		expect(isUserCancellation(new Error('User force closed the prompt'))).toBe(true)
		expect(isUserCancellation(new Error('cancelled by user'))).toBe(true)
	})

	test('detects cancellation nested in cause', () => {
		const cause = Object.assign(new Error('interrupted'), { code: 'SIGINT' })
		const error = new Error('wrapper', { cause })

		expect(isUserCancellation(error)).toBe(true)
	})

	test('does not classify ordinary failures as user cancellation', () => {
		expect(isUserCancellation(new TypeError('publish failed'))).toBe(false)
		expect(isUserCancellation(new Error('HTTP 500 from registry'))).toBe(false)
		expect(isUserCancellation({ code: 'EACCES', message: 'permission denied' })).toBe(false)
		expect(isUserCancellation(null)).toBe(false)
	})
})

describe('isUserCancellationExitCode', () => {
	test('only treats 130 as cancellation', () => {
		expect(isUserCancellationExitCode(130)).toBe(true)
		expect(isUserCancellationExitCode('130')).toBe(true)
		expect(isUserCancellationExitCode(1)).toBe(false)
		expect(isUserCancellationExitCode(undefined)).toBe(false)
	})
})
