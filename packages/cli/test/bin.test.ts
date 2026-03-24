import { describe, expect, test } from 'bun:test'
import { getFlag } from '../src/bin.js'

describe('getFlag', () => {
  test('returns value after flag', () => {
    const result = getFlag(['cmd', '--repo', 'owner/repo', '--verbose'], '--repo')
    expect(result).toBe('owner/repo')
  })

  test('returns null when flag not found', () => {
    const result = getFlag(['cmd', '--verbose'], '--repo')
    expect(result).toBeNull()
  })

  test('returns null when flag is last argument', () => {
    const result = getFlag(['cmd', '--repo'], '--repo')
    expect(result).toBeNull()
  })

  test('handles flag at different positions', () => {
    const result = getFlag(['list', '--all', '--app', 'my-cli'], '--app')
    expect(result).toBe('my-cli')
  })

  test('returns first match when flag appears multiple times', () => {
    const result = getFlag(['--repo', 'first', '--repo', 'second'], '--repo')
    expect(result).toBe('first')
  })
})
