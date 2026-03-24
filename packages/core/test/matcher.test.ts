import { describe, expect, test, mock } from 'bun:test'
import { normalizeQuery } from '../src/matcher/normalize-query.js'
import { match } from '../src/matcher/match.js'

describe('normalizeQuery', () => {
  test('removes file paths', () => {
    const q = normalizeQuery({ name: 'Error', message: 'ENOENT at /Users/me/project/foo.ts' })
    expect(q).not.toContain('/Users/me')
  })

  test('removes special characters', () => {
    const q = normalizeQuery({ name: 'Error', message: 'Failed: [object Object]' })
    expect(q).not.toContain('[')
    expect(q).not.toContain(']')
  })

  test('truncates to 100 chars', () => {
    const long = 'a'.repeat(200)
    const q = normalizeQuery({ name: 'Error', message: long })
    expect(q.length).toBeLessThanOrEqual(100)
  })

  test('removes Windows-style paths', () => {
    const q = normalizeQuery({ name: 'Error', message: 'Failed at C:\\Users\\me\\project\\file.ts' })
    expect(q).not.toContain('C:\\Users')
  })

  test('combines error name and message', () => {
    const q = normalizeQuery({ name: 'TypeError', message: 'x is not a function' })
    expect(q).toContain('TypeError')
    expect(q).toContain('x is not a function')
  })
})

describe('match', () => {
  test('returns empty result when dedupe is disabled', async () => {
    const result = await match(
      { error: { name: 'Error', message: 'test' } } as any,
      { repo: 'owner/repo', dedupe: { enabled: false } } as any,
    )
    expect(result.found).toBe(false)
    expect(result.matches).toHaveLength(0)
  })

  test('returns empty result on network failure', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock(() => Promise.reject(new Error('network error')))
    try {
      const result = await match(
        { error: { name: 'Error', message: 'test' } } as any,
        { repo: 'owner/repo', dedupe: { enabled: true } } as any,
      )
      expect(result.found).toBe(false)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('returns matches from successful GitHub search', async () => {
    const originalFetch = globalThis.fetch
    let callCount = 0
    globalThis.fetch = mock(() => {
      callCount++
      // First call: labeled search (cluvo-report) — no results
      if (callCount === 1) {
        return Promise.resolve(new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }))
      }
      // Second call: general search — returns the issue
      return Promise.resolve(new Response(JSON.stringify({
        items: [
          {
            number: 42,
            title: 'Same error here',
            html_url: 'https://github.com/owner/repo/issues/42',
            state: 'open',
            labels: [{ name: 'bug' }],
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    })
    try {
      const result = await match(
        { error: { name: 'TypeError', message: 'x is not a function' } } as any,
        { repo: 'owner/repo', dedupe: { enabled: true } } as any,
      )
      expect(result.found).toBe(true)
      expect(result.matches).toHaveLength(1)
      expect(result.matches[0].number).toBe(42)
      expect(result.matches[0].title).toBe('Same error here')
      expect(result.matches[0].state).toBe('open')
      expect(result.matches[0].labels).toEqual(['bug'])
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
