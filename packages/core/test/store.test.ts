import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Store } from '../src/store/store.js'
import type { ErrorReport } from '../src/types.js'

function makeReport(id: string, status: 'pending' | 'submitted' | 'dismissed' = 'pending'): ErrorReport {
  return {
    id,
    createdAt: new Date().toISOString(),
    app: { name: 'test-app', version: '1.0.0', runtime: 'node' },
    error: { name: 'Error', message: `error ${id}` },
    environment: { os: 'darwin', arch: 'arm64', runtimeVersion: 'v20.0.0' },
    sanitizedFields: [],
    status,
  }
}

describe('Store', () => {
  let storeDir: string
  let store: Store

  beforeEach(async () => {
    storeDir = await mkdtemp(join(tmpdir(), 'cluvo-test-'))
    store = new Store(storeDir)
  })

  afterEach(async () => {
    await rm(storeDir, { recursive: true, force: true })
  })

  test('save and load a report', async () => {
    const report = makeReport('r1')
    await store.save(report)
    const loaded = await store.load('test-app', 'r1')
    expect(loaded).not.toBeNull()
    expect(loaded!.id).toBe('r1')
    expect(loaded!.error.message).toBe('error r1')
  })

  test('list reports for an app', async () => {
    await store.save(makeReport('r1'))
    await store.save(makeReport('r2'))
    const list = await store.list('test-app')
    expect(list).toHaveLength(2)
  })

  test('list only pending reports', async () => {
    await store.save(makeReport('r1', 'pending'))
    await store.save(makeReport('r2', 'submitted'))
    const list = await store.list('test-app', { statusFilter: 'pending' })
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('r1')
  })

  test('list all apps', async () => {
    await store.save(makeReport('r1'))
    const r2 = makeReport('r2')
    r2.app.name = 'other-app'
    await store.save(r2)
    const list = await store.list()
    expect(list).toHaveLength(2)
  })

  test('update report status', async () => {
    await store.save(makeReport('r1'))
    await store.updateStatus('test-app', 'r1', 'submitted', 'https://github.com/issue/1')
    const loaded = await store.load('test-app', 'r1')
    expect(loaded!.status).toBe('submitted')
    expect(loaded!.issueUrl).toBe('https://github.com/issue/1')
  })

  test('delete a report', async () => {
    await store.save(makeReport('r1'))
    await store.delete('test-app', 'r1')
    const loaded = await store.load('test-app', 'r1')
    expect(loaded).toBeNull()
  })

  test('clean removes submitted and dismissed', async () => {
    await store.save(makeReport('r1', 'pending'))
    await store.save(makeReport('r2', 'submitted'))
    await store.save(makeReport('r3', 'dismissed'))
    await store.clean('test-app')
    const list = await store.list('test-app')
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('r1')
  })

  test('evict oldest when maxReports exceeded', async () => {
    const smallStore = new Store(storeDir, 2)
    await smallStore.save(makeReport('r1', 'submitted'))
    await smallStore.save(makeReport('r2', 'pending'))
    await smallStore.save(makeReport('r3', 'pending'))
    const list = await smallStore.list('test-app')
    expect(list).toHaveLength(2)
    // r1 (submitted) should be evicted first
    expect(list.find((r) => r.id === 'r1')).toBeUndefined()
  })
})
