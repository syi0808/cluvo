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
		registry.register({ id: 'a', depth: 5, reporter, childPolicy: 'absorb' })
		expect(registry.stack).toHaveLength(1)
	})

	test('single reporter has no parent', () => {
		const registry = getRegistry()
		const entry = { id: 'a', depth: 5, reporter: fakeReporter(), childPolicy: 'absorb' as const }
		registry.register(entry)
		expect(registry.getParent(entry)).toBeNull()
	})

	test('post-order: deeper depth registered first becomes child', () => {
		const registry = getRegistry()
		// ESM post-order: child (deeper) registers before parent (shallower)
		const child = { id: 'child', depth: 7, reporter: fakeReporter(), childPolicy: 'absorb' as const }
		const parent = { id: 'parent', depth: 5, reporter: fakeReporter(), childPolicy: 'absorb' as const }
		registry.register(child)
		registry.register(parent)
		expect(registry.getParent(child)?.id).toBe('parent')
		expect(registry.getParent(parent)).toBeNull()
	})

	test('3-level nesting: grandchild → child → parent', () => {
		const registry = getRegistry()
		const grandchild = { id: 'grandchild', depth: 9, reporter: fakeReporter(), childPolicy: 'absorb' as const }
		const child = { id: 'child', depth: 7, reporter: fakeReporter(), childPolicy: 'absorb' as const }
		const parent = { id: 'parent', depth: 5, reporter: fakeReporter(), childPolicy: 'absorb' as const }
		registry.register(grandchild)
		registry.register(child)
		registry.register(parent)
		expect(registry.getParent(grandchild)?.id).toBe('child')
		expect(registry.getParent(child)?.id).toBe('parent')
		expect(registry.getParent(parent)).toBeNull()
	})

	test('siblings: same depth reporters share parent', () => {
		const registry = getRegistry()
		// parent imports child-a and child-b (post-order: child-a, child-b, parent)
		const childA = { id: 'child-a', depth: 7, reporter: fakeReporter(), childPolicy: 'absorb' as const }
		const childB = { id: 'child-b', depth: 7, reporter: fakeReporter(), childPolicy: 'absorb' as const }
		const parent = { id: 'parent', depth: 5, reporter: fakeReporter(), childPolicy: 'absorb' as const }
		registry.register(childA)
		registry.register(childB)
		registry.register(parent)
		expect(registry.getParent(childA)?.id).toBe('parent')
		expect(registry.getParent(childB)?.id).toBe('parent')
		expect(registry.getParent(parent)).toBeNull()
	})

	test('independent reporters at same depth have no parent', () => {
		const registry = getRegistry()
		const a = { id: 'a', depth: 5, reporter: fakeReporter(), childPolicy: 'absorb' as const }
		const b = { id: 'b', depth: 5, reporter: fakeReporter(), childPolicy: 'absorb' as const }
		registry.register(a)
		registry.register(b)
		expect(registry.getParent(a)).toBeNull()
		expect(registry.getParent(b)).toBeNull()
	})

	test('complex tree: parent with child-a(+nephew) and child-b', () => {
		const registry = getRegistry()
		// Tree: parent → child-a → nephew, parent → child-b
		// Post-order: nephew, child-a, child-b, parent
		const nephew = { id: 'nephew', depth: 9, reporter: fakeReporter(), childPolicy: 'absorb' as const }
		const childA = { id: 'child-a', depth: 7, reporter: fakeReporter(), childPolicy: 'absorb' as const }
		const childB = { id: 'child-b', depth: 7, reporter: fakeReporter(), childPolicy: 'absorb' as const }
		const parent = { id: 'parent', depth: 5, reporter: fakeReporter(), childPolicy: 'absorb' as const }
		registry.register(nephew)
		registry.register(childA)
		registry.register(childB)
		registry.register(parent)
		expect(registry.getParent(nephew)?.id).toBe('child-a')
		expect(registry.getParent(childA)?.id).toBe('parent')
		expect(registry.getParent(childB)?.id).toBe('parent')
		expect(registry.getParent(parent)).toBeNull()
	})

	test('unregister removes reporter and re-resolves hierarchy', () => {
		const registry = getRegistry()
		const child = { id: 'child', depth: 7, reporter: fakeReporter(), childPolicy: 'absorb' as const }
		const parent = { id: 'parent', depth: 5, reporter: fakeReporter(), childPolicy: 'absorb' as const }
		registry.register(child)
		registry.register(parent)
		expect(registry.getParent(child)?.id).toBe('parent')

		registry.unregister('parent')
		expect(registry.stack).toHaveLength(1)
		expect(registry.getParent(child)).toBeNull()
	})

	test('Symbol.for ensures same registry across calls', () => {
		const r1 = getRegistry()
		const r2 = getRegistry()
		expect(r1).toBe(r2)
	})

	describe('regression: import order reversal (ESM post-order)', () => {
		test('child registers BEFORE parent — depth determines role, not order', () => {
			const registry = getRegistry()
			// With a naive "previous = parent" algorithm, the first registrant
			// would be treated as parent. The depth-based algorithm must make
			// the deeper reporter the child regardless of registration order.
			const child = { id: 'child', depth: 10, reporter: fakeReporter(), childPolicy: 'absorb' as const }
			const parent = { id: 'parent', depth: 4, reporter: fakeReporter(), childPolicy: 'absorb' as const }

			// Child registers first (ESM post-order: deepest module executes first)
			registry.register(child)
			// At this point child has no parent yet
			expect(registry.getParent(child)).toBeNull()

			// Parent registers second
			registry.register(parent)
			// Now child must point to parent, not the other way around
			expect(registry.getParent(child)?.id).toBe('parent')
			expect(registry.getParent(parent)).toBeNull()
		})

		test('reversed registration in 3-level chain: grandchild, child, parent', () => {
			const registry = getRegistry()
			const grandchild = { id: 'gc', depth: 15, reporter: fakeReporter(), childPolicy: 'absorb' as const }
			const child = { id: 'mid', depth: 10, reporter: fakeReporter(), childPolicy: 'absorb' as const }
			const parent = { id: 'root', depth: 5, reporter: fakeReporter(), childPolicy: 'absorb' as const }

			// All register in reverse depth order (deepest first)
			registry.register(grandchild)
			registry.register(child)
			registry.register(parent)

			expect(registry.getParent(grandchild)?.id).toBe('mid')
			expect(registry.getParent(child)?.id).toBe('root')
			expect(registry.getParent(parent)).toBeNull()
		})
	})

	describe('regression: late parent registration re-resolves hierarchy', () => {
		test('child registers first, parent registers later — hierarchy re-resolves', () => {
			const registry = getRegistry()
			const child = { id: 'child', depth: 8, reporter: fakeReporter(), childPolicy: 'absorb' as const }

			registry.register(child)
			// No parent registered yet — child is a root
			expect(registry.getParent(child)).toBeNull()

			// Parent registers later (e.g., lazy import or dynamic registration)
			const parent = { id: 'parent', depth: 4, reporter: fakeReporter(), childPolicy: 'absorb' as const }
			registry.register(parent)

			// After re-resolve, child must now point to parent
			expect(registry.getParent(child)?.id).toBe('parent')
			expect(registry.getParent(parent)).toBeNull()
		})
	})

	describe('regression: re-resolve on unregister promotes children', () => {
		test('unregistering middle node makes grandchild a direct child of grandparent', () => {
			const registry = getRegistry()
			const grandchild = { id: 'gc', depth: 12, reporter: fakeReporter(), childPolicy: 'absorb' as const }
			const middle = { id: 'mid', depth: 8, reporter: fakeReporter(), childPolicy: 'absorb' as const }
			const grandparent = { id: 'gp', depth: 4, reporter: fakeReporter(), childPolicy: 'absorb' as const }

			registry.register(grandchild)
			registry.register(middle)
			registry.register(grandparent)

			// Before removal: gc → mid → gp
			expect(registry.getParent(grandchild)?.id).toBe('mid')
			expect(registry.getParent(middle)?.id).toBe('gp')

			// Remove the middle node
			registry.unregister('mid')

			// After removal: gc should now point directly to gp
			expect(registry.getParent(grandchild)?.id).toBe('gp')
			expect(registry.getParent(grandparent)).toBeNull()
			expect(registry.stack).toHaveLength(2)
		})

		test('unregistering middle node with no grandparent makes child a root', () => {
			const registry = getRegistry()
			const grandchild = { id: 'gc', depth: 12, reporter: fakeReporter(), childPolicy: 'absorb' as const }
			const middle = { id: 'mid', depth: 8, reporter: fakeReporter(), childPolicy: 'absorb' as const }

			registry.register(grandchild)
			registry.register(middle)

			expect(registry.getParent(grandchild)?.id).toBe('mid')

			registry.unregister('mid')

			// No grandparent exists — grandchild becomes root
			expect(registry.getParent(grandchild)).toBeNull()
			expect(registry.stack).toHaveLength(1)
		})
	})

	describe('regression: same depth = no hierarchy', () => {
		test('two reporters at identical depth never form parent-child', () => {
			const registry = getRegistry()
			const a = { id: 'a', depth: 7, reporter: fakeReporter(), childPolicy: 'absorb' as const }
			const b = { id: 'b', depth: 7, reporter: fakeReporter(), childPolicy: 'absorb' as const }

			registry.register(a)
			registry.register(b)

			expect(registry.getParent(a)).toBeNull()
			expect(registry.getParent(b)).toBeNull()
		})

		test('three reporters at identical depth are all roots', () => {
			const registry = getRegistry()
			const a = { id: 'x', depth: 5, reporter: fakeReporter(), childPolicy: 'absorb' as const }
			const b = { id: 'y', depth: 5, reporter: fakeReporter(), childPolicy: 'absorb' as const }
			const c = { id: 'z', depth: 5, reporter: fakeReporter(), childPolicy: 'absorb' as const }

			registry.register(a)
			registry.register(b)
			registry.register(c)

			expect(registry.getParent(a)).toBeNull()
			expect(registry.getParent(b)).toBeNull()
			expect(registry.getParent(c)).toBeNull()
		})

		test('same-depth reporters with a shallower parent all become children of that parent', () => {
			const registry = getRegistry()
			const s1 = { id: 's1', depth: 8, reporter: fakeReporter(), childPolicy: 'absorb' as const }
			const s2 = { id: 's2', depth: 8, reporter: fakeReporter(), childPolicy: 'absorb' as const }
			const parent = { id: 'p', depth: 4, reporter: fakeReporter(), childPolicy: 'absorb' as const }

			registry.register(s1)
			registry.register(s2)
			registry.register(parent)

			// Both siblings point to parent, never to each other
			expect(registry.getParent(s1)?.id).toBe('p')
			expect(registry.getParent(s2)?.id).toBe('p')
			expect(registry.getParent(parent)).toBeNull()
		})
	})
})
