import type { Store, ErrorReport, ReporterConfig } from '@cluvo/core'
import { formatTitle, formatBody, publish as corePublish } from '@cluvo/core'

export async function submitReport(
  store: Store,
  report: ErrorReport,
  config: { repo: string; mode?: ReporterConfig['mode'] },
): Promise<string | null> {
  const draft = {
    title: formatTitle(report),
    body: formatBody(report),
  }
  const result = await corePublish(draft, {
    repo: config.repo,
    mode: config.mode,
  })

  await store.updateStatus(report.app.name, report.id, 'submitted', result.issueUrl)
  return result.issueUrl ?? result.filePath ?? null
}

export async function submitAll(
  store: Store,
  config: { repo: string; mode?: ReporterConfig['mode'] },
  confirm?: (report: ErrorReport) => Promise<boolean>,
): Promise<{ submitted: number; skipped: number; failed: number }> {
  const pending = await store.list(undefined, { statusFilter: 'pending' })
  let submitted = 0
  let skipped = 0
  let failed = 0
  for (const report of pending) {
    if (confirm) {
      const approved = await confirm(report)
      if (!approved) {
        skipped++
        continue
      }
    }
    try {
      await submitReport(store, report, config)
      submitted++
    } catch {
      failed++
    }
  }
  return { submitted, skipped, failed }
}
