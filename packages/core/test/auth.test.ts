import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

let mockExecFile: ReturnType<typeof mock>

mock.module('node:child_process', () => ({
	execFile: (...args: unknown[]) => mockExecFile(...args),
}))

const { checkGhInstalled, checkGhAuth, getGithubToken, isAuthAvailable } = await import(
	'../src/publisher/auth.js'
)

describe('checkGhInstalled', () => {
	test('returns true when gh --version exits 0', async () => {
		mockExecFile = mock(
			(
				_cmd: string,
				_args: string[],
				cb: (err: Error | null, stdout: string, stderr: string) => void,
			) => {
				cb(null, 'gh version 2.40.0', '')
			},
		)
		expect(await checkGhInstalled()).toBe(true)
		expect(mockExecFile).toHaveBeenCalledWith('gh', ['--version'], expect.any(Function))
	})

	test('returns false when gh --version exits non-zero', async () => {
		mockExecFile = mock(
			(
				_cmd: string,
				_args: string[],
				cb: (err: Error | null, stdout: string, stderr: string) => void,
			) => {
				const err = Object.assign(new Error('exit 1'), { code: 1 })
				cb(err, '', 'some error')
			},
		)
		expect(await checkGhInstalled()).toBe(false)
	})

	test('returns false when execFile throws ENOENT', async () => {
		mockExecFile = mock(
			(
				_cmd: string,
				_args: string[],
				cb: (err: Error | null, stdout: string, stderr: string) => void,
			) => {
				const err = Object.assign(new Error('spawn gh ENOENT'), { code: 'ENOENT' })
				cb(err, '', '')
			},
		)
		expect(await checkGhInstalled()).toBe(false)
	})
})

describe('checkGhAuth', () => {
	test('returns true when gh auth status exits 0', async () => {
		mockExecFile = mock(
			(
				_cmd: string,
				_args: string[],
				cb: (err: Error | null, stdout: string, stderr: string) => void,
			) => {
				cb(null, '', '')
			},
		)
		expect(await checkGhAuth()).toBe(true)
		expect(mockExecFile).toHaveBeenCalledWith('gh', ['auth', 'status'], expect.any(Function))
	})

	test('returns false when gh auth status exits non-zero', async () => {
		mockExecFile = mock(
			(
				_cmd: string,
				_args: string[],
				cb: (err: Error | null, stdout: string, stderr: string) => void,
			) => {
				const err = Object.assign(new Error('exit 1'), { code: 1 })
				cb(err, '', 'not logged in')
			},
		)
		expect(await checkGhAuth()).toBe(false)
	})
})

describe('getGithubToken', () => {
	let savedGithubToken: string | undefined
	let savedGhToken: string | undefined

	beforeEach(() => {
		savedGithubToken = process.env.GITHUB_TOKEN
		savedGhToken = process.env.GH_TOKEN
		delete process.env.GITHUB_TOKEN
		delete process.env.GH_TOKEN
	})

	afterEach(() => {
		if (savedGithubToken !== undefined) process.env.GITHUB_TOKEN = savedGithubToken
		else delete process.env.GITHUB_TOKEN
		if (savedGhToken !== undefined) process.env.GH_TOKEN = savedGhToken
		else delete process.env.GH_TOKEN
	})

	test('returns GITHUB_TOKEN when set', () => {
		process.env.GITHUB_TOKEN = 'ghp_abc123'
		process.env.GH_TOKEN = 'ghp_other'
		expect(getGithubToken()).toBe('ghp_abc123')
	})

	test('returns GH_TOKEN when GITHUB_TOKEN absent', () => {
		process.env.GH_TOKEN = 'ghp_fallback'
		expect(getGithubToken()).toBe('ghp_fallback')
	})

	test('returns undefined when neither set', () => {
		expect(getGithubToken()).toBeUndefined()
	})
})

describe('isAuthAvailable', () => {
	let savedGithubToken: string | undefined
	let savedGhToken: string | undefined

	beforeEach(() => {
		savedGithubToken = process.env.GITHUB_TOKEN
		savedGhToken = process.env.GH_TOKEN
		delete process.env.GITHUB_TOKEN
		delete process.env.GH_TOKEN
	})

	afterEach(() => {
		if (savedGithubToken !== undefined) process.env.GITHUB_TOKEN = savedGithubToken
		else delete process.env.GITHUB_TOKEN
		if (savedGhToken !== undefined) process.env.GH_TOKEN = savedGhToken
		else delete process.env.GH_TOKEN
	})

	test('returns true when token present, false when no token and gh auth fails', async () => {
		process.env.GITHUB_TOKEN = 'ghp_token'
		expect(await isAuthAvailable()).toBe(true)

		delete process.env.GITHUB_TOKEN
		mockExecFile = mock(
			(
				_cmd: string,
				_args: string[],
				cb: (err: Error | null, stdout: string, stderr: string) => void,
			) => {
				const err = Object.assign(new Error('exit 1'), { code: 1 })
				cb(err, '', '')
			},
		)
		expect(await isAuthAvailable()).toBe(false)
	})
})
