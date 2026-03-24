import { describe, expect, test, afterEach } from 'bun:test'
import { sanitize } from '../src/sanitizer/sanitize.js'
import { DEFAULT_RULES, getHomeRule, ARGV_SENSITIVE_FLAGS } from '../src/sanitizer/rules.js'
import type { ErrorReport } from '../src/types.js'

function makeReport(overrides: Partial<ErrorReport> = {}): ErrorReport {
  return {
    id: 'test-id',
    createdAt: new Date().toISOString(),
    app: { name: 'test', version: '1.0.0', runtime: 'node' },
    error: { name: 'Error', message: 'test error' },
    environment: { os: 'darwin', arch: 'arm64', runtimeVersion: 'v20.0.0' },
    sanitizedFields: [],
    status: 'pending',
    ...overrides,
  }
}

describe('sanitize', () => {
  test('masks bearer tokens in stack trace', () => {
    const report = makeReport({
      error: {
        name: 'Error',
        message: 'Auth failed',
        stack: 'Authorization: Bearer ghp_abc123xyz789',
      },
    })
    const result = sanitize(report)
    expect(result.error.stack).not.toContain('ghp_abc123xyz789')
    expect(result.error.stack).toContain('[REDACTED]')
    expect(result.sanitizedFields).toContain('error.stack')
  })

  test('masks API keys in error message', () => {
    const report = makeReport({
      error: {
        name: 'Error',
        message: 'Failed with api_key=sk_live_abc123def456',
      },
    })
    const result = sanitize(report)
    expect(result.error.message).not.toContain('sk_live_abc123def456')
  })

  test('replaces home directory paths', () => {
    const home = process.env.HOME || '/home/user'
    const report = makeReport({
      error: {
        name: 'Error',
        message: `File not found: ${home}/projects/secret/file.ts`,
        stack: `Error: at ${home}/projects/secret/file.ts:10:5`,
      },
    })
    const result = sanitize(report)
    expect(result.error.message).toContain('~/')
    expect(result.error.message).not.toContain(home)
  })

  test('masks email addresses', () => {
    const report = makeReport({
      error: { name: 'Error', message: 'User john.doe@example.com not found' },
    })
    const result = sanitize(report)
    expect(result.error.message).not.toContain('john.doe')
    expect(result.error.message).toContain('***@example.com')
  })

  test('returns new object (immutable)', () => {
    const report = makeReport()
    const result = sanitize(report)
    expect(result).not.toBe(report)
    expect(result.error).not.toBe(report.error)
  })

  test('applies custom rules', () => {
    const report = makeReport({
      error: { name: 'Error', message: 'internal.corp.com returned 500' },
    })
    const result = sanitize(report, [
      { name: 'internal-url', pattern: /internal\.corp\.com/g, replacement: '<INTERNAL>' },
    ])
    expect(result.error.message).toContain('<INTERNAL>')
  })

  test('masks password patterns', () => {
    const report = makeReport({
      error: { name: 'Error', message: 'password=SuperSecret123' },
    })
    const result = sanitize(report)
    expect(result.error.message).not.toContain('SuperSecret123')
  })

  test('masks argv tokens', () => {
    const report = makeReport({
      command: {
        command: 'deploy',
        argv: ['deploy', '--token', 'ghp_secret123', '--verbose'],
      },
    })
    const result = sanitize(report)
    expect(result.command!.argv).not.toContain('ghp_secret123')
  })

  test('masks sk-token patterns', () => {
    const report = makeReport({
      error: { name: 'Error', message: 'Key: sk-live-abc123def456xyz' },
    })
    const result = sanitize(report)
    expect(result.error.message).not.toContain('sk-live-abc123def456xyz')
    expect(result.error.message).toContain('[REDACTED]')
  })

  test('masks private key blocks', () => {
    const key = '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg...\n-----END PRIVATE KEY-----'
    const report = makeReport({
      error: { name: 'Error', message: `Leaked: ${key}` },
    })
    const result = sanitize(report)
    expect(result.error.message).toContain('[REDACTED PRIVATE KEY]')
    expect(result.error.message).not.toContain('MIIEvQIBADANBg')
  })

  test('sanitizes causeChain entries', () => {
    const report = makeReport({
      error: {
        name: 'Error',
        message: 'top',
        causeChain: ['Failed with api_key=my_secret_123'],
      },
    })
    const result = sanitize(report)
    expect(result.error.causeChain![0]).not.toContain('my_secret_123')
  })
})

describe('rules', () => {
  test('getHomeRule returns no-op when HOME is not set', () => {
    const savedHome = process.env.HOME
    const savedProfile = process.env.USERPROFILE
    delete process.env.HOME
    delete process.env.USERPROFILE
    try {
      const rule = getHomeRule()
      expect(rule.name).toBe('home-path')
      // no-op pattern should not match anything
      expect('some text /Users/foo'.replace(new RegExp(rule.pattern.source, rule.pattern.flags), rule.replacement)).toBe('some text /Users/foo')
    } finally {
      if (savedHome !== undefined) process.env.HOME = savedHome
      if (savedProfile !== undefined) process.env.USERPROFILE = savedProfile
    }
  })

  test('ARGV_SENSITIVE_FLAGS contains expected flags', () => {
    expect(ARGV_SENSITIVE_FLAGS.has('--token')).toBe(true)
    expect(ARGV_SENSITIVE_FLAGS.has('--api-key')).toBe(true)
    expect(ARGV_SENSITIVE_FLAGS.has('--secret')).toBe(true)
    expect(ARGV_SENSITIVE_FLAGS.has('--password')).toBe(true)
    expect(ARGV_SENSITIVE_FLAGS.has('-t')).toBe(true)
  })
})
