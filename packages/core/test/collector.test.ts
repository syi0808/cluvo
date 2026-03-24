import { describe, expect, test, afterEach } from 'bun:test'
import { captureError } from '../src/collector/capture-error.js'
import { collectEnvironment } from '../src/collector/collect-environment.js'
import { collectApp } from '../src/collector/collect-app.js'
import { collectCommand } from '../src/collector/collect-command.js'

describe('captureError', () => {
  test('extracts name, message, stack from Error', () => {
    const err = new Error('something broke')
    const payload = captureError(err)
    expect(payload.name).toBe('Error')
    expect(payload.message).toBe('something broke')
    expect(payload.stack).toContain('something broke')
  })

  test('handles TypeError', () => {
    const err = new TypeError('not a function')
    const payload = captureError(err)
    expect(payload.name).toBe('TypeError')
    expect(payload.message).toBe('not a function')
  })

  test('converts string to ErrorPayload', () => {
    const payload = captureError('plain string error')
    expect(payload.name).toBe('Error')
    expect(payload.message).toBe('plain string error')
    expect(payload.stack).toBeDefined()
  })

  test('converts number to ErrorPayload', () => {
    const payload = captureError(42)
    expect(payload.message).toBe('42')
  })

  test('handles null/undefined', () => {
    expect(captureError(null).message).toBe('null')
    expect(captureError(undefined).message).toBe('undefined')
  })

  test('extracts cause chain', () => {
    const root = new Error('root cause')
    const mid = new Error('mid', { cause: root })
    const top = new Error('top', { cause: mid })
    const payload = captureError(top)
    expect(payload.causeChain).toEqual(['mid', 'root cause'])
  })

  test('handles error without cause', () => {
    const err = new Error('no cause')
    const payload = captureError(err)
    expect(payload.causeChain).toBeUndefined()
  })
})

describe('collectEnvironment', () => {
  test('returns os, arch, runtimeVersion', () => {
    const env = collectEnvironment()
    expect(env.os).toBeTruthy()
    expect(env.arch).toBeTruthy()
    expect(env.runtimeVersion).toBeTruthy()
  })

  test('detects CI environment', () => {
    const env = collectEnvironment()
    expect(typeof env.ci).toBe('boolean')
  })
})

describe('collectApp', () => {
  test('returns app context from config', () => {
    const app = collectApp({ name: 'my-cli', version: '1.0.0' })
    expect(app.name).toBe('my-cli')
    expect(app.version).toBe('1.0.0')
    expect(app.runtime).toBeTruthy()
  })

  test('includes gitSha when provided', () => {
    const app = collectApp({ name: 'x', version: '1.0.0', gitSha: 'abc123' })
    expect(app.gitSha).toBe('abc123')
  })
})

describe('detectPackageManager (via collectEnvironment)', () => {
  const savedUA = process.env.npm_config_user_agent

  afterEach(() => {
    if (savedUA !== undefined) process.env.npm_config_user_agent = savedUA
    else delete process.env.npm_config_user_agent
  })

  test('detects npm when user_agent starts with npm/', () => {
    process.env.npm_config_user_agent = 'npm/9.0.0 node/v20.0.0 darwin arm64'
    const env = collectEnvironment()
    expect(env.packageManager).toBe('npm')
  })

  test('detects pnpm when user_agent starts with pnpm/', () => {
    process.env.npm_config_user_agent = 'pnpm/8.6.0 node/v20.0.0 darwin arm64'
    const env = collectEnvironment()
    expect(env.packageManager).toBe('pnpm')
  })

  test('returns undefined when npm_config_user_agent is not set', () => {
    delete process.env.npm_config_user_agent
    const env = collectEnvironment()
    expect(env.packageManager).toBeUndefined()
  })
})

describe('collectCommand', () => {
  test('parses argv into command context', () => {
    const ctx = collectCommand(['node', 'cli', 'deploy', 'prod', '--force'])
    expect(ctx.command).toBe('deploy')
    expect(ctx.subcommand).toBe('prod')
    expect(ctx.argv).toEqual(['deploy', 'prod', '--force'])
  })

  test('handles empty argv', () => {
    const ctx = collectCommand([])
    expect(ctx.command).toBeUndefined()
    expect(ctx.argv).toEqual([])
  })

  test('handles undefined argv', () => {
    const ctx = collectCommand()
    expect(ctx.argv).toBeDefined()
  })
})
