import type { Store, ErrorReport } from '@cluvo/core'
import { renderSummary, formatTitle, formatBody } from '@cluvo/core'

export async function showReport(store: Store, id: string): Promise<ErrorReport | null> {
  return store.findById(id)
}

export function formatReportDetail(report: ErrorReport): string {
  const draft = { title: formatTitle(report), body: formatBody(report), labels: [] }
  return renderSummary(report, draft) + '\n\n' + draft.body
}
