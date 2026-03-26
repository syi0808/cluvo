// NOTE: Do NOT import Reporter from ./reporter.js to avoid circular dependency.
// Use a minimal interface instead.

export interface RegisteredReporter {
	id: string
	depth: number
	reporter: { receiveChildReport(report: import('@cluvo/core').ErrorReport): Promise<void> }
	childPolicy: 'absorb' | 'passthrough' | 'silent'
}

interface ReporterRegistry {
	stack: RegisteredReporter[]
	parentMap: Map<string, string> // childId -> parentId
	register(entry: RegisteredReporter): void
	unregister(id: string): void
	getParent(entry: RegisteredReporter): RegisteredReporter | null
}

const REGISTRY_KEY = Symbol.for('cluvo.registry')

/**
 * Reconstruct parent-child hierarchy from post-order registration + stack depth.
 *
 * ESM modules execute depth-first post-order: deepest child first, root last.
 * Combined with call stack depth (deeper import chain = higher frame count),
 * we can rebuild the full tree without explicit parent declarations.
 */
function resolveHierarchy(stack: RegisteredReporter[], parentMap: Map<string, string>): void {
	parentMap.clear()
	const pending: RegisteredReporter[] = []

	for (const reporter of stack) {
		// Reporters with deeper stack depth registered before this one
		// are children of this reporter (post-order property)
		while (pending.length > 0 && pending[pending.length - 1].depth > reporter.depth) {
			const child = pending.pop()
			if (!child) break
			parentMap.set(child.id, reporter.id)
		}
		pending.push(reporter)
	}
	// Remaining entries in pending have no parent (roots or independent reporters)
}

function createRegistry(): ReporterRegistry {
	const stack: RegisteredReporter[] = []
	const parentMap = new Map<string, string>()

	return {
		stack,
		parentMap,

		register(entry: RegisteredReporter) {
			stack.push(entry)
			resolveHierarchy(stack, parentMap)
		},

		unregister(id: string) {
			const idx = stack.findIndex((e) => e.id === id)
			if (idx !== -1) stack.splice(idx, 1)
			resolveHierarchy(stack, parentMap)
		},

		getParent(entry: RegisteredReporter): RegisteredReporter | null {
			const parentId = parentMap.get(entry.id)
			if (!parentId) return null
			return stack.find((e) => e.id === parentId) ?? null
		},
	}
}

export function getRegistry(): ReporterRegistry {
	const g = globalThis as Record<symbol, ReporterRegistry>
	if (!g[REGISTRY_KEY]) {
		g[REGISTRY_KEY] = createRegistry()
	}
	return g[REGISTRY_KEY]
}

// For testing only
export function resetRegistry(): void {
	const g = globalThis as Record<symbol, ReporterRegistry>
	delete g[REGISTRY_KEY]
}
