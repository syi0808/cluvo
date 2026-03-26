import { afterEach, describe, expect, test } from 'bun:test'
import { getRegistry, resetRegistry } from '../src/registry.js'
import type { RegisteredReporter } from '../src/registry.js'

function fakeReporter(): RegisteredReporter['reporter'] {
	return {
		receiveChildReport: async () => {},
	}
}

describe('ReporterRegistry', () => {
	afterEach(() => resetRegistry())

	test('registers a reporter and retrieves it', () => {
		const registry = getRegistry()
		const reporter = fakeReporter()
		registry.register({ id: 'a', reporter, childPolicy: 'absorb' })
		expect(registry.stack).toHaveLength(1)
	})

	test('getParent returns null for first registered reporter', () => {
		const registry = getRegistry()
		const entry = { id: 'a', reporter: fakeReporter(), childPolicy: 'absorb' as const }
		registry.register(entry)
		expect(registry.getParent(entry)).toBeNull()
	})

	test('getParent returns parent when child registers after parent (implicit)', () => {
		const registry = getRegistry()
		const parent = { id: 'a', reporter: fakeReporter(), childPolicy: 'absorb' as const }
		const child = { id: 'b', reporter: fakeReporter(), childPolicy: 'absorb' as const }
		registry.register(parent)
		registry.register(child)
		expect(registry.getParent(child)?.id).toBe('a')
	})

	test('getParent uses explicit parentId', () => {
		const registry = getRegistry()
		const a = { id: 'a', reporter: fakeReporter(), childPolicy: 'absorb' as const }
		const b = { id: 'b', reporter: fakeReporter(), childPolicy: 'absorb' as const }
		const c = { id: 'c', reporter: fakeReporter(), childPolicy: 'absorb' as const }
		registry.register(a)
		registry.register(b)
		registry.register(c, 'a') // c's parent is a, not b
		expect(registry.getParent(c)?.id).toBe('a')
	})

	test('unregister removes reporter from stack', () => {
		const registry = getRegistry()
		registry.register({ id: 'a', reporter: fakeReporter(), childPolicy: 'absorb' })
		registry.register({ id: 'b', reporter: fakeReporter(), childPolicy: 'absorb' })
		registry.unregister('a')
		expect(registry.stack).toHaveLength(1)
		expect(registry.stack[0].id).toBe('b')
	})

	test('getParent returns null after parent is unregistered', () => {
		const registry = getRegistry()
		const parent = { id: 'a', reporter: fakeReporter(), childPolicy: 'absorb' as const }
		const child = { id: 'b', reporter: fakeReporter(), childPolicy: 'absorb' as const }
		registry.register(parent)
		registry.register(child)
		registry.unregister('a')
		expect(registry.getParent(child)).toBeNull()
	})

	test('Symbol.for ensures same registry across calls', () => {
		const r1 = getRegistry()
		const r2 = getRegistry()
		expect(r1).toBe(r2)
	})
})
