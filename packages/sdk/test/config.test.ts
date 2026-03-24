import { afterEach, describe, expect, test } from 'bun:test'
import { type InternalConfig, resolveConfig } from '../src/config.js'

const base: InternalConfig = { repo: 'o/r', app: { name: 'x', version: '1' } }

describe('resolveConfig', () => {
	const savedHome = process.env.HOME

	afterEach(() => {
		if (savedHome !== undefined) process.env.HOME = savedHome
	})

	test('applies default mode=browser', () => {
		const config = resolveConfig(base)
		expect(config.mode).toBe('browser')
	})

	test('applies default interactive=auto', () => {
		const config = resolveConfig(base)
		expect(config.interactive).toBe('auto')
	})

	test('applies default nonInteractive=save', () => {
		const config = resolveConfig(base)
		expect(config.nonInteractive).toBe('save')
	})

	test('uses HOME for storeDir', () => {
		process.env.HOME = '/mock/home'
		const config = resolveConfig(base)
		expect(config.storeDir).toContain('/mock/home')
		expect(config.storeDir).toContain('.cluvo')
	})

	test('uses _storeDir override', () => {
		const config = resolveConfig({
			...base,
			_storeDir: '/custom/dir',
		})
		expect(config.storeDir).toBe('/custom/dir')
	})

	test('applies collect defaults', () => {
		const config = resolveConfig(base)
		expect(config.collect?.argv).toBe(true)
		expect(config.collect?.diagnosticReport).toBe(false)
	})

	test('applies store defaults', () => {
		const config = resolveConfig(base)
		expect(config.store?.enabled).toBe(true)
		expect(config.store?.maxReports).toBe(100)
	})

	test('preserves user overrides', () => {
		const config = resolveConfig({
			...base,
			mode: 'api',
			interactive: 'never',
			collect: { argv: false },
			store: { enabled: false, maxReports: 50 },
		})
		expect(config.mode).toBe('api')
		expect(config.interactive).toBe('never')
		expect(config.collect?.argv).toBe(false)
		expect(config.store?.enabled).toBe(false)
		expect(config.store?.maxReports).toBe(50)
	})
})
