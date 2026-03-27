import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DraftPayload, ErrorReport } from '@cluvo/core'
import type { InternalConfig } from '../src/config.js'

export function makeReport(overrides: Partial<ErrorReport> = {}): ErrorReport {
	return {
		id: 'test-id',
		createdAt: '2026-03-27T10:00:00Z',
		app: { name: 'test-app', version: '1.0.0', runtime: 'node' },
		error: { name: 'Error', message: 'test error' },
		environment: { os: 'darwin', arch: 'arm64', runtimeVersion: 'v22.0.0' },
		sanitizedFields: [],
		status: 'pending',
		...overrides,
	}
}

export function makeDraft(overrides: Partial<DraftPayload> = {}): DraftPayload {
	return {
		title: 'Error: test error',
		body: '## Summary\n\nTest body',
		...overrides,
	}
}

export function makeConfig(overrides: Partial<InternalConfig> = {}): InternalConfig {
	return {
		repo: 'owner/repo',
		app: { name: 'test-cli', version: '1.0.0' },
		...overrides,
	}
}

export function makeSilentConfig(storeDir: string, overrides: Partial<InternalConfig> = {}): InternalConfig {
	return {
		repo: 'owner/repo',
		app: { name: 'test-cli', version: '1.0.0' },
		interactive: 'never',
		nonInteractive: 'silent',
		store: { enabled: true },
		dedupe: { enabled: false },
		_storeDir: storeDir,
		...overrides,
	}
}

export async function createTempDir(): Promise<string> {
	return await mkdtemp(join(tmpdir(), 'cluvo-test-'))
}

export async function cleanTempDir(dir: string): Promise<void> {
	await rm(dir, { recursive: true, force: true })
}
