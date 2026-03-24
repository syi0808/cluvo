import { afterEach, describe, expect, test } from 'bun:test'
import { apiCreate } from '../src/publisher/github-api.js'
import type { DraftPayload } from '../src/types.js'

const draft: DraftPayload = {
	title: 'Test Error',
	body: '## Summary\n\nTest error body',
	labels: ['bug'],
}

describe('apiCreate', () => {
	const originalFetch = globalThis.fetch

	afterEach(() => {
		globalThis.fetch = originalFetch
	})

	test('sends correct POST request and returns html_url on success', async () => {
		let capturedUrl = ''
		let capturedInit: RequestInit | undefined

		globalThis.fetch = async (input, init) => {
			capturedUrl = input as string
			capturedInit = init
			return new Response(JSON.stringify({ html_url: 'https://github.com/owner/repo/issues/1' }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			})
		}

		const url = await apiCreate(draft, 'owner/repo', 'ghp_token123')

		expect(url).toBe('https://github.com/owner/repo/issues/1')
		expect(capturedUrl).toBe('https://api.github.com/repos/owner/repo/issues')
		expect(capturedInit?.method).toBe('POST')

		const headers = capturedInit?.headers as Record<string, string>
		expect(headers.Authorization).toBe('Bearer ghp_token123')
		expect(headers.Accept).toBe('application/vnd.github.v3+json')
		expect(headers['User-Agent']).toBe('cluvo')

		const body = JSON.parse(capturedInit?.body as string)
		expect(body.title).toBe('Test Error')
		expect(body.body).toBe('## Summary\n\nTest error body')
		expect(body.labels).toEqual(['bug'])
	})

	test('sends empty labels when draft.labels is undefined', async () => {
		let capturedInit: RequestInit | undefined

		globalThis.fetch = async (_input, init) => {
			capturedInit = init
			return new Response(JSON.stringify({ html_url: 'https://github.com/owner/repo/issues/2' }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			})
		}

		const draftNoLabels: DraftPayload = { title: 'No Labels', body: 'body' }
		await apiCreate(draftNoLabels, 'owner/repo', 'ghp_token')

		const body = JSON.parse(capturedInit?.body as string)
		expect(body.labels).toEqual([])
	})

	test('throws on non-ok response with status and body', async () => {
		globalThis.fetch = async () => {
			return new Response('Not Found', { status: 404 })
		}

		expect(apiCreate(draft, 'owner/repo', 'ghp_token')).rejects.toThrow(
			'GitHub API error 404: Not Found',
		)
	})

	test('propagates network error when fetch rejects', async () => {
		globalThis.fetch = async () => {
			throw new TypeError('Failed to fetch')
		}

		expect(apiCreate(draft, 'owner/repo', 'ghp_token')).rejects.toThrow('Failed to fetch')
	})
})
