import { describe, expect, test } from 'bun:test'
import { formatTitle } from '@cluvo/core'
import type { InternalConfig } from '../src/config.js'
import { resolveConfig } from '../src/config.js'

describe('presets', () => {
	const base: InternalConfig = {
		repo: 'owner/repo',
		app: { name: 'test', version: '1.0.0' },
	}

	test('cli preset sets argv collection, auto interactive', () => {
		const config = resolveConfig({ ...base, preset: 'cli' })
		expect(config.collect?.argv).toBe(true)
		expect(config.interactive).toBe('auto')
	})

	test('sdk preset disables argv, sets interactive to never', () => {
		const config = resolveConfig({ ...base, preset: 'sdk' })
		expect(config.collect?.argv).toBe(false)
		expect(config.interactive).toBe('never')
	})

	test('no preset defaults to cli behavior', () => {
		const config = resolveConfig(base)
		expect(config.collect?.argv).toBe(true)
		expect(config.interactive).toBe('auto')
	})

	test('preset values can be overridden', () => {
		const config = resolveConfig({ ...base, preset: 'sdk', interactive: 'auto' })
		expect(config.interactive).toBe('auto')
		expect(config.collect?.argv).toBe(false) // rest of sdk preset intact
	})

	test('sdk preset excludes command from default sections', () => {
		const config = resolveConfig({ ...base, preset: 'sdk' })
		expect(config.issue?.sections).not.toContain('command')
	})

	test('cli preset includes command in default sections', () => {
		const config = resolveConfig({ ...base, preset: 'cli' })
		const sections = config.issue?.sections
		expect(sections).toContain('command')
	})

	test('formatTitle omits command prefix when no command context (SDK preset)', () => {
		// SDK preset disables argv collection, so no command context exists.
		// The existing formatTitle in core already conditionally adds [command] prefix
		// only when report.command?.command is present. This test verifies the implicit behavior.
		const report = {
			error: { name: 'Error', message: 'test' },
			command: undefined, // no command context in SDK preset
		}
		const title = formatTitle(report)
		expect(title).toBe('Error: test')
		expect(title).not.toMatch(/^\[/)
	})

	test('formatTitle includes command prefix when command context exists (CLI preset)', () => {
		const report = {
			error: { name: 'Error', message: 'test' },
			command: { command: 'deploy' },
		}
		const title = formatTitle(report)
		expect(title).toBe('[deploy] Error: test')
	})
})
