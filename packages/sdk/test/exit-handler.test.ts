import { afterEach, describe, expect, mock, test } from 'bun:test'
import { createExitHandler } from '../src/exit-handler.js'

describe('createExitHandler', () => {
	let listeners: Map<string, Function[]>
	let originalExit: typeof process.exit

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
		const pendingReport = { id: 'test-1', status: 'pending' as const }
		const onPending = mock(async () => {})
		const cleanup = createExitHandler({
			getPendingReports: async () => [pendingReport as any],
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
		const pendingReport = { id: 'loop-1', status: 'pending' as const }
		const onPending = mock(async () => {})
		const cleanup = createExitHandler({
			getPendingReports: async () => [pendingReport as any],
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
})
