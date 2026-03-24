import type { Store } from '@cluvo/core'

export interface CleanOptions {
	olderThanDays?: number
}

export async function cleanReports(store: Store, options: CleanOptions): Promise<number> {
	const all = await store.list()
	const olderThanMs = options.olderThanDays
		? options.olderThanDays * 24 * 60 * 60 * 1000
		: undefined
	const now = Date.now()

	const cleanable = all.filter((r) => {
		const shouldClean = r.status === 'submitted' || r.status === 'dismissed'
		const isOld = olderThanMs ? now - new Date(r.createdAt).getTime() > olderThanMs : true
		return shouldClean && isOld
	})

	await store.clean(undefined, olderThanMs)
	return cleanable.length
}
