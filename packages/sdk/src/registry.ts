// NOTE: Do NOT import Reporter from ./reporter.js to avoid circular dependency.
// Use a minimal interface instead.

export interface RegisteredReporter {
	id: string
	reporter: { receiveChildReport(report: import('@cluvo/core').ErrorReport): Promise<void> }
	childPolicy: 'absorb' | 'passthrough' | 'silent'
}

interface ReporterRegistry {
	stack: RegisteredReporter[]
	parentMap: Map<string, string> // childId -> parentId
	register(entry: RegisteredReporter, parentId?: string): void
	unregister(id: string): void
	getParent(entry: RegisteredReporter): RegisteredReporter | null
}

const REGISTRY_KEY = Symbol.for('cluvo.registry')

function createRegistry(): ReporterRegistry {
	const stack: RegisteredReporter[] = []
	const parentMap = new Map<string, string>()

	return {
		stack,
		parentMap,

		register(entry: RegisteredReporter, parentId?: string) {
			stack.push(entry)
			if (parentId) {
				parentMap.set(entry.id, parentId)
			} else if (stack.length > 1) {
				// Implicit: parent is the previously registered reporter
				parentMap.set(entry.id, stack[stack.length - 2].id)
			}
		},

		unregister(id: string) {
			const idx = stack.findIndex((e) => e.id === id)
			if (idx !== -1) stack.splice(idx, 1)
			parentMap.delete(id)
			// Clean up children that pointed to this parent
			for (const [childId, pid] of parentMap) {
				if (pid === id) parentMap.delete(childId)
			}
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
