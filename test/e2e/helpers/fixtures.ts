import type { ErrorPayload, ErrorReport, ReporterConfig } from '@cluvo/core'
import type { InternalConfig } from '../../packages/sdk/src/config.js'

class AppError extends Error {
	code: string
	constructor(message: string, code: string) {
		super(message)
		this.name = 'AppError'
		this.code = code
	}
}

export function createErrors() {
	const simple = new Error('Something went wrong')
	const rootCause = new Error('Root cause: ECONNREFUSED')
	const withCause = new Error('Connection failed', { cause: rootCause })
	const level1 = new Error('Level 1')
	const level2 = new Error('Level 2', { cause: level1 })
	const deepCause = new Error('Level 3', { cause: level2 })
	const typeError = new TypeError('Cannot read properties of undefined (reading "foo")')
	const customError = new AppError('ECONNREFUSED 127.0.0.1:5432', 'NETWORK')
	const withSensitive = new Error(
		'Connection to postgres://admin:s3cretP4ss@db.internal:5432/prod failed with token ghp_abc123secret456',
	)
	const circular = new Error('Circular reference error')
	;(circular as any).self = circular

	return {
		simple,
		withCause,
		deepCause,
		typeError,
		customError,
		nonError: 'string error thrown' as unknown,
		nullError: null as unknown,
		withSensitive,
		circular,
	}
}

interface ConfigFixture extends Omit<InternalConfig, '_storeDir'> {}

const base: ConfigFixture = {
	repo: 'test-owner/test-repo',
	app: { name: 'test-app', version: '1.0.0' },
}

export const configs = {
	minimal: { ...base },
	cliPreset: { ...base, preset: 'cli' as const },
	sdkPreset: { ...base, preset: 'sdk' as const },
	customLabels: { ...base, issue: { labels: ['bug', 'auto-report'] } },
	noSanitize: { ...base, sanitize: { enabled: false } },
	noStore: { ...base, store: { enabled: false } },
	noDedupe: { ...base, dedupe: { enabled: false } },
	customTitle: {
		...base,
		issue: {
			title: (ctx: { command?: string; error: ErrorPayload }) =>
				`[${ctx.command ?? 'unknown'}] ${ctx.error.name}: ${ctx.error.message}`,
		},
	},
	fileModeOnly: { ...base, mode: 'file' as const },
	nonInteractiveSave: { ...base, interactive: 'never' as const, nonInteractive: 'save' as const },
	nonInteractiveSilent: {
		...base,
		interactive: 'never' as const,
		nonInteractive: 'silent' as const,
	},
	nonInteractiveLog: { ...base, interactive: 'never' as const, nonInteractive: 'log' as const },
} as const satisfies Record<string, ConfigFixture>

export function withStoreDir(config: ConfigFixture, storeDir: string): InternalConfig {
	return { ...config, _storeDir: storeDir, _skipTopLevelCheck: true } as InternalConfig
}

export function makeReport(
	id: string,
	appName: string = 'test-app',
	overrides: Partial<ErrorReport> = {},
): ErrorReport {
	return {
		id,
		createdAt: new Date().toISOString(),
		app: { name: appName, version: '1.0.0', runtime: 'bun' },
		error: { name: 'Error', message: `Test error ${id}` },
		environment: { os: 'darwin', arch: 'arm64', runtimeVersion: '1.0.0' },
		sanitizedFields: [],
		status: 'pending',
		...overrides,
	}
}
