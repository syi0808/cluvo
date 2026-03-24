import type { ExistingIssue } from '../types.js'

interface GitHubSearchItem {
  number: number
  title: string
  html_url: string
  state: 'open' | 'closed'
  labels: Array<{ name: string }>
  created_at: string
}

interface GitHubSearchResponse {
  items: GitHubSearchItem[]
}

function buildHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'cluvo',
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  return headers
}

function mapItem(item: GitHubSearchItem): ExistingIssue {
  return {
    type: 'issue',
    number: item.number,
    title: item.title,
    url: item.html_url,
    state: item.state,
    labels: item.labels?.map((l) => l.name) ?? [],
    createdAt: item.created_at,
  }
}

async function fetchIssues(
  searchQuery: string,
  headers: Record<string, string>,
): Promise<ExistingIssue[]> {
  const url = `https://api.github.com/search/issues?q=${encodeURIComponent(searchQuery)}&per_page=5&sort=relevance`
  const response = await fetch(url, { headers })
  if (!response.ok) return []

  const data: GitHubSearchResponse = await response.json() as GitHubSearchResponse
  return (data.items ?? []).map(mapItem)
}

export async function searchIssues(
  repo: string,
  query: string,
  options?: { token?: string; searchDiscussions?: boolean },
): Promise<ExistingIssue[]> {
  const headers = buildHeaders(options?.token)

  // Priority: search for issues with cluvo-report label first
  const labeledQuery = `repo:${repo} is:issue label:cluvo-report ${query}`
  const labeled = await fetchIssues(labeledQuery, headers)

  // Then general search
  const generalQuery = `repo:${repo} is:issue ${query}`
  const general = await fetchIssues(generalQuery, headers)

  // Merge: labeled first, then unlabeled (deduplicate by number)
  const seen = new Set(labeled.map((i) => i.number))
  const unlabeled = general.filter((i) => !seen.has(i.number))

  return [...labeled, ...unlabeled].slice(0, 5)
}
