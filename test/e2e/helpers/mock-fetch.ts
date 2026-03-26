import { mock } from 'bun:test'
import type { ExistingIssue } from '@cluvo/core'

export interface MockGitHubOptions {
  searchResults?: ExistingIssue[]
  createIssueUrl?: string
  createIssueError?: number
  searchError?: number
  latency?: number
}

export function createMockFetch(options: MockGitHubOptions = {}): typeof fetch {
  const {
    searchResults = [],
    createIssueUrl,
    createIssueError,
    searchError,
    latency = 0,
  } = options

  return mock(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()

    if (latency > 0) {
      await new Promise((resolve) => setTimeout(resolve, latency))
    }

    if (url.includes('api.github.com/search/issues')) {
      if (searchError) {
        return new Response(JSON.stringify({ message: 'Search failed' }), {
          status: searchError,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(
        JSON.stringify({
          total_count: searchResults.length,
          items: searchResults.map((issue) => ({
            number: issue.number,
            title: issue.title,
            html_url: issue.url,
            state: issue.state ?? 'open',
            labels: (issue.labels ?? []).map((l) => ({ name: l })),
            created_at: issue.createdAt ?? new Date().toISOString(),
          })),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    if (url.includes('api.github.com/repos/') && init?.method === 'POST') {
      if (createIssueError) {
        return new Response(JSON.stringify({ message: 'Create failed' }), {
          status: createIssueError,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      const issueUrl = createIssueUrl ?? 'https://github.com/test/repo/issues/42'
      return new Response(
        JSON.stringify({ html_url: issueUrl, number: 42 }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      )
    }

    if (url.includes('/reactions') && init?.method === 'POST') {
      return new Response(JSON.stringify({ id: 1 }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (url.includes('api.github.com')) {
      return new Response(JSON.stringify({ message: 'Not Found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    throw new Error(`Unexpected fetch call: ${url}`)
  }) as typeof fetch
}

export function installMockFetch(options: MockGitHubOptions = {}): () => void {
  const originalFetch = globalThis.fetch
  globalThis.fetch = createMockFetch(options)
  return () => {
    globalThis.fetch = originalFetch
  }
}

export function mockFetchScript(options: MockGitHubOptions = {}): string {
  const { searchResults = [], createIssueUrl, createIssueError, searchError } = options
  return `
const __searchResults = ${JSON.stringify(searchResults)};
const __createIssueUrl = ${JSON.stringify(createIssueUrl ?? 'https://github.com/test/repo/issues/42')};
const __createIssueError = ${JSON.stringify(createIssueError ?? null)};
const __searchError = ${JSON.stringify(searchError ?? null)};

globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.toString();
  if (url.includes('api.github.com/search/issues')) {
    if (__searchError) return new Response(JSON.stringify({ message: 'fail' }), { status: __searchError });
    return new Response(JSON.stringify({
      total_count: __searchResults.length,
      items: __searchResults.map(i => ({
        number: i.number, title: i.title, html_url: i.url,
        state: i.state ?? 'open', labels: (i.labels ?? []).map(l => ({ name: l })),
        created_at: i.createdAt ?? new Date().toISOString(),
      })),
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (url.includes('api.github.com/repos/') && init?.method === 'POST') {
    if (__createIssueError) return new Response(JSON.stringify({ message: 'fail' }), { status: __createIssueError });
    return new Response(JSON.stringify({ html_url: __createIssueUrl, number: 42 }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  }
  if (url.includes('/reactions') && init?.method === 'POST') {
    return new Response(JSON.stringify({ id: 1 }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  }
  if (url.includes('api.github.com')) {
    return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }
  throw new Error('Unexpected fetch: ' + url);
};
`
}
