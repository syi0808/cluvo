import { describe, expect, test } from 'bun:test'
import { EventEmitter } from 'node:events'
import { readKey, readYesNo } from '../src/presenter/io.js'

function createMockStdin() {
	const emitter = new EventEmitter() as EventEmitter & {
		isTTY: boolean
		setRawMode: (mode: boolean) => void
		resume: () => void
		pause: () => void
	}
	emitter.isTTY = true
	emitter.setRawMode = () => {}
	emitter.resume = () => {}
	emitter.pause = () => {}
	return emitter
}

describe('readYesNo', () => {
	test('returns true on Y input', async () => {
		const stdin = createMockStdin()
		const chunks: string[] = []
		const write = (chunk: string) => {
			chunks.push(chunk)
			return true
		}

		const promise = readYesNo(stdin as any, write)
		stdin.emit('data', Buffer.from('Y'))
		const result = await promise

		expect(result).toBe(true)
		expect(chunks.join('')).toContain('Y')
	})

	test('returns true on empty input (default yes)', async () => {
		const stdin = createMockStdin()
		const write = (_: string) => true

		const promise = readYesNo(stdin as any, write)
		stdin.emit('data', Buffer.from(' '))
		const result = await promise

		expect(result).toBe(true)
	})

	test('returns false on n input', async () => {
		const stdin = createMockStdin()
		const chunks: string[] = []
		const write = (chunk: string) => {
			chunks.push(chunk)
			return true
		}

		const promise = readYesNo(stdin as any, write)
		stdin.emit('data', Buffer.from('n'))
		const result = await promise

		expect(result).toBe(false)
		expect(chunks.join('')).toContain('n')
	})

	test('returns false when stdin is not a TTY', async () => {
		const stdin = createMockStdin()
		stdin.isTTY = false
		const write = (_: string) => true

		const result = await readYesNo(stdin as any, write)
		expect(result).toBe(false)
	})
})

describe('readKey', () => {
	test('returns lowercase key', async () => {
		const stdin = createMockStdin()
		const chunks: string[] = []
		const write = (chunk: string) => {
			chunks.push(chunk)
			return true
		}

		const promise = readKey(stdin as any, write)
		stdin.emit('data', Buffer.from('O'))
		const result = await promise

		expect(result).toBe('o')
		expect(chunks.join('')).toContain('o')
	})

	test('returns trimmed key', async () => {
		const stdin = createMockStdin()
		const write = (_: string) => true

		const promise = readKey(stdin as any, write)
		stdin.emit('data', Buffer.from('  s  '))
		const result = await promise

		expect(result).toBe('s')
	})
})
