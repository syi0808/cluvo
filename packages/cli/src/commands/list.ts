import type { ErrorReport, Store } from '@cluvo/core'

export interface ListOptions {
	app?: string
	all?: boolean
}

export async function listReports(store: Store, options: ListOptions): Promise<ErrorReport[]> {
	const reports = await store.list(options.app)
	if (options.all) return reports
	return reports.filter((r) => r.status === 'pending')
}

export function formatReportList(reports: ErrorReport[]): string {
	if (reports.length === 0) return 'No reports found.'
	const lines = reports.map((r) => {
		const status = r.status === 'pending' ? '●' : r.status === 'submitted' ? '✓' : '✗'
		const date = new Date(r.createdAt).toLocaleDateString()
		return `  ${status} ${r.id}  ${r.app.name}  ${r.error.name}: ${r.error.message.slice(0, 60)}  ${date}`
	})
	return lines.join('\n')
}
