import { afterEach, describe, expect, mock, test } from 'bun:test'
import type { ErrorReport } from '@cluvo/core'
import { createExitHandler } from '../src/exit-handler.js'

describe('createExitHandler', () => {
	let originalExit: typeof process.exit

	function makePendingReport(id: string): ErrorReport {
		return {
			id,
			createdAt: new Date().toISOString(),
			app: { name: 'test-app', version: '1.0.0', runtime: 'bun' },
			error: { name: 'Error', message: `Pending report ${id}` },
			environment: { os: 'darwin', arch: 'arm64', runtimeVersion: '1.0.0' },
			sanitizedFields: [],
			status: 'pending',
		}
	}

	afterEach(() => {
		// Restore any patched process.exit
		if (originalExit) process.exit = originalExit
		// Remove any listeners we added
		process.removeAllListeners('beforeExit')
	})

	test('registers beforeExit listener', () => {
		const onPending = mock(async () => {})
		const cleanup = createExitHandler({ getPendingReports: async () => [], onPending })
		expect(typeof cleanup).toBe('function')
		cleanup()
	})

	test('calls onPending when pending reports exist at beforeExit', async () => {
		const pendingReport = makePendingReport('test-1')
		const onPending = mock(async () => {})
		const cleanup = createExitHandler({
			getPendingReports: async () => [pendingReport],
			onPending,
		})

		// Simulate beforeExit
		process.emit('beforeExit', 0)
		// Give async handler time to run
		await new Promise((r) => setTimeout(r, 50))

		expect(onPending).toHaveBeenCalledWith([pendingReport])
		cleanup()
	})

	test('does not call onPending when no pending reports', async () => {
		const onPending = mock(async () => {})
		const cleanup = createExitHandler({
			getPendingReports: async () => [],
			onPending,
		})

		process.emit('beforeExit', 0)
		await new Promise((r) => setTimeout(r, 50))

		expect(onPending).not.toHaveBeenCalled()
		cleanup()
	})

	test('ignores configured cancellation exit code at beforeExit', async () => {
		const pendingReport = makePendingReport('cancel-before-exit')
		const onPending = mock(async () => {})
		const cleanup = createExitHandler({
			getPendingReports: async () => [pendingReport],
			onPending,
			shouldIgnoreExitCode: (code) => code === 130,
		})

		process.emit('beforeExit', 130)
		await new Promise((r) => setTimeout(r, 50))

		expect(onPending).not.toHaveBeenCalled()
		cleanup()
	})

	test('cleanup removes listener', () => {
		const onPending = mock(async () => {})
		const cleanup = createExitHandler({
			getPendingReports: async () => [],
			onPending,
		})
		const before = process.listenerCount('beforeExit')
		cleanup()
		const after = process.listenerCount('beforeExit')
		expect(after).toBeLessThan(before)
	})

	test('does not re-trigger onPending after beforeExit re-fires', async () => {
		const pendingReport = makePendingReport('loop-1')
		const onPending = mock(async () => {})
		const cleanup = createExitHandler({
			getPendingReports: async () => [pendingReport],
			onPending,
		})

		// First beforeExit — should call onPending
		process.emit('beforeExit', 0)
		await new Promise((r) => setTimeout(r, 50))
		expect(onPending).toHaveBeenCalledTimes(1)

		// Second beforeExit — handling flag stays true, should NOT re-trigger
		process.emit('beforeExit', 0)
		await new Promise((r) => setTimeout(r, 50))
		expect(onPending).toHaveBeenCalledTimes(1)

		cleanup()
	})

	test('interceptProcessExit patches process.exit', () => {
		originalExit = process.exit
		const onPending = mock(async () => {})
		const cleanup = createExitHandler({
			getPendingReports: async () => [],
			onPending,
			interceptProcessExit: true,
		})
		expect(process.exit).not.toBe(originalExit)
		cleanup()
		expect(process.exit).toBe(originalExit)
	})

	test('interceptProcessExit skips pending processing for configured cancellation exit code', () => {
		originalExit = process.exit
		const exitCalls: unknown[] = []
		process.exit = ((code?: number | string | null) => {
			exitCalls.push(code)
			throw new Error('exit')
		}) as typeof process.exit

		const pendingReport = makePendingReport('cancel-process-exit')
		const onPending = mock(async () => {})
		const cleanup = createExitHandler({
			getPendingReports: async () => [pendingReport],
			onPending,
			interceptProcessExit: true,
			shouldIgnoreExitCode: (code) => code === 130,
		})

		try {
			expect(() => process.exit(130)).toThrow('exit')
		} finally {
			cleanup()
		}
		expect(onPending).not.toHaveBeenCalled()
		expect(exitCalls).toEqual([130])
	})
})
