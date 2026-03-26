import { afterEach, describe, expect, test } from 'bun:test'
import {
	bold,
	boldCyan,
	dim,
	green,
	isColorEnabled,
	setColorEnabled,
	stripAnsi,
	yellow,
} from '../src/presenter/style.js'

afterEach(() => setColorEnabled(false))

describe('style helpers', () => {
	test('returns plain text when disabled', () => {
		setColorEnabled(false)
		expect(bold('hello')).toBe('hello')
		expect(dim('hello')).toBe('hello')
		expect(boldCyan('hello')).toBe('hello')
		expect(yellow('hello')).toBe('hello')
		expect(green('hello')).toBe('hello')
	})

	test('wraps with ANSI codes when enabled', () => {
		setColorEnabled(true)
		expect(bold('hello')).toBe('\x1b[1mhello\x1b[0m')
		expect(dim('hello')).toBe('\x1b[2mhello\x1b[0m')
		expect(boldCyan('hello')).toBe('\x1b[1;36mhello\x1b[0m')
		expect(yellow('hello')).toBe('\x1b[33mhello\x1b[0m')
		expect(green('hello')).toBe('\x1b[32mhello\x1b[0m')
	})

	test('setColorEnabled toggles isColorEnabled', () => {
		setColorEnabled(true)
		expect(isColorEnabled()).toBe(true)
		setColorEnabled(false)
		expect(isColorEnabled()).toBe(false)
	})
})

describe('stripAnsi', () => {
	test('removes ANSI escape codes', () => {
		expect(stripAnsi('\x1b[1mhello\x1b[0m')).toBe('hello')
		expect(stripAnsi('\x1b[1;36m── Bug Report\x1b[0m')).toBe('── Bug Report')
	})

	test('returns plain text unchanged', () => {
		expect(stripAnsi('hello')).toBe('hello')
	})
})
