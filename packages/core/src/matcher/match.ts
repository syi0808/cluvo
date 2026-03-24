import type { ErrorReport, MatchResult, ReporterConfig } from '../types.js'
import { normalizeQuery } from './normalize-query.js'
import { searchIssues } from './search-issues.js'

export async function match(
  report: ErrorReport,
  config: ReporterConfig,
): Promise<MatchResult> {
  if (!config.dedupe?.enabled) {
    return { found: false, matches: [] }
  }

  try {
    const query = normalizeQuery(report.error)
    const matches = await searchIssues(config.repo, query, {
      searchDiscussions: config.dedupe?.searchDiscussions,
    })
    return { found: matches.length > 0, matches }
  } catch {
    return { found: false, matches: [] }
  }
}
