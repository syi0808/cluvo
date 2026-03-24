import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Store } from '@cluvo/core'
import type { ErrorReport } from '@cluvo/core'
import { listReports } from '../src/commands/list.js'
import { showReport } from '../src/commands/show.js'
import { dismissReport } from '../src/commands/dismiss.js'
import { cleanReports } from '../src/commands/clean.js'

function makeReport(id: string, appName = 'test-app', status: 'pending' | 'submitted' | 'dismissed' = 'pending'): ErrorReport {
  return {
    id,
    createdAt: new Date().toISOString(),
    app: { name: appName, version: '1.0.0', runtime: 'node' },
    error: { name: 'Error', message: `error ${id}` },
    environment: { os: 'darwin', arch: 'arm64', runtimeVersion: 'v20.0.0' },
    sanitizedFields: [],
    status,
  }
}

describe('CLI commands', () => {
  let storeDir: string
  let store: Store

  beforeEach(async () => {
    storeDir = await mkdtemp(join(tmpdir(), 'cluvo-cli-'))
    store = new Store(storeDir)
  })
  afterEach(async () => {
    await rm(storeDir, { recursive: true, force: true })
  })

  test('list returns pending reports', async () => {
    await store.save(makeReport('r1'))
    await store.save(makeReport('r2', 'test-app', 'submitted'))
    const result = await listReports(store, {})
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('r1')
  })

  test('list --all returns all reports', async () => {
    await store.save(makeReport('r1'))
    await store.save(makeReport('r2', 'test-app', 'submitted'))
    const result = await listReports(store, { all: true })
    expect(result).toHaveLength(2)
  })

  test('list --app filters by app', async () => {
    await store.save(makeReport('r1', 'app-a'))
    await store.save(makeReport('r2', 'app-b'))
    const result = await listReports(store, { app: 'app-a', all: true })
    expect(result).toHaveLength(1)
  })

  test('show returns specific report', async () => {
    await store.save(makeReport('r1'))
    const result = await showReport(store, 'r1')
    expect(result).not.toBeNull()
    expect(result!.id).toBe('r1')
  })

  test('dismiss updates report status', async () => {
    await store.save(makeReport('r1'))
    await dismissReport(store, 'test-app', 'r1')
    const report = await store.load('test-app', 'r1')
    expect(report!.status).toBe('dismissed')
  })

  test('clean removes submitted/dismissed', async () => {
    await store.save(makeReport('r1', 'test-app', 'pending'))
    await store.save(makeReport('r2', 'test-app', 'submitted'))
    await cleanReports(store, {})
    const all = await store.list('test-app')
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe('r1')
  })
})
