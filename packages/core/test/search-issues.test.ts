import { describe, expect, test, afterEach } from 'bun:test'
import { searchIssues } from '../src/matcher/search-issues.js'

function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    number: 1,
    title: 'Default issue',
    html_url: 'https://github.com/owner/repo/issues/1',
    state: 'open',
    labels: [{ name: 'bug' }],
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function okResponse(items: unknown[]) {
  return new Response(JSON.stringify({ items }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function failResponse() {
  return new Response('error', { status: 500 })
}

describe('searchIssues', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('calls fetch twice (labeled then general search)', async () => {
    const urls: string[] = []

    globalThis.fetch = async (input) => {
      urls.push(input as string)
      return okResponse([])
    }

    await searchIssues('owner/repo', 'crash on startup')

    expect(urls).toHaveLength(2)
    expect(urls[0]).toContain('label%3Acluvo-report')
    expect(urls[1]).not.toContain('label%3Acluvo-report')
  })

  test('deduplicates by issue number', async () => {
    const sharedItem = makeItem({ number: 42, title: 'Duplicate issue' })
    let callCount = 0

    globalThis.fetch = async () => {
      callCount++
      return okResponse(callCount === 1 ? [sharedItem] : [sharedItem])
    }

    const results = await searchIssues('owner/repo', 'duplicate')

    expect(results).toHaveLength(1)
    expect(results[0].number).toBe(42)
  })

  test('labeled issues appear first in results', async () => {
    const labeledItem = makeItem({ number: 10, title: 'Labeled' })
    const generalItem = makeItem({ number: 20, title: 'General' })
    let callCount = 0

    globalThis.fetch = async () => {
      callCount++
      return okResponse(callCount === 1 ? [labeledItem] : [generalItem])
    }

    const results = await searchIssues('owner/repo', 'query')

    expect(results).toHaveLength(2)
    expect(results[0].number).toBe(10)
    expect(results[1].number).toBe(20)
  })

  test('limits to 5 results total', async () => {
    const labeledItems = Array.from({ length: 4 }, (_, i) =>
      makeItem({ number: i + 1, title: `Labeled ${i + 1}` }),
    )
    const generalItems = Array.from({ length: 4 }, (_, i) =>
      makeItem({ number: i + 10, title: `General ${i + 1}` }),
    )
    let callCount = 0

    globalThis.fetch = async () => {
      callCount++
      return okResponse(callCount === 1 ? labeledItems : generalItems)
    }

    const results = await searchIssues('owner/repo', 'many results')

    expect(results).toHaveLength(5)
    // First 4 should be labeled, 5th should be general
    expect(results[4].number).toBe(10)
  })

  test('includes Authorization header when token provided', async () => {
    const capturedHeaders: Record<string, string>[] = []

    globalThis.fetch = async (_input, init) => {
      capturedHeaders.push({ ...(init?.headers as Record<string, string>) })
      return okResponse([])
    }

    await searchIssues('owner/repo', 'auth test', { token: 'ghp_secret' })

    expect(capturedHeaders).toHaveLength(2)
    expect(capturedHeaders[0].Authorization).toBe('Bearer ghp_secret')
    expect(capturedHeaders[1].Authorization).toBe('Bearer ghp_secret')
  })

  test('returns empty array when both searches fail', async () => {
    globalThis.fetch = async () => failResponse()

    const results = await searchIssues('owner/repo', 'fail')

    expect(results).toEqual([])
  })
})
