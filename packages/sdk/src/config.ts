import { join } from 'node:path'
import type { ReporterConfig } from '@cluvo/core'
import { PRESETS } from './presets.js'

export interface InternalConfig extends ReporterConfig {
	_storeDir?: string
	_skipTopLevelCheck?: boolean
	_depth?: number
}

const KNOWN_KEYS = new Set([
	'repo',
	'app',
	'preset',
	'presenter',
	'childPolicy',
	'mode',
	'interactive',
	'nonInteractive',
	'collect',
	'sanitize',
	'issue',
	'store',
	'dedupe',
	'prompt',
	'branding',
	// internal keys
	'_storeDir',
	'_skipTopLevelCheck',
	'_depth',
])

const VALID_PRESETS = new Set(['cli', 'sdk'])

function validateConfig(config: InternalConfig): void {
	if (!process.env.CLUVO_DEBUG) return

	for (const key of Object.keys(config)) {
		if (!KNOWN_KEYS.has(key)) {
			process.stderr.write(`[cluvo] unknown config key: "${key}"\n`)
		}
	}

	if (config.preset && !VALID_PRESETS.has(config.preset)) {
		process.stderr.write(
			`[cluvo] invalid preset: "${config.preset}" (expected "cli" or "sdk")\n`,
		)
	}
}

export function resolveConfig(
	config: InternalConfig,
): Required<Pick<ReporterConfig, 'mode' | 'interactive' | 'nonInteractive'>> &
	InternalConfig & { storeDir: string } {
	validateConfig(config)
	const presetName = config.preset ?? 'cli'
	const preset = PRESETS[presetName]

	return {
		...config,
		mode: config.mode ?? 'browser',
		interactive: config.interactive ?? preset?.interactive ?? 'auto',
		nonInteractive: config.nonInteractive ?? 'save',
		storeDir: config._storeDir ?? join(process.env.HOME || '.', '.cluvo'),
		collect: {
			argv: preset?.collect?.argv ?? true,
			diagnosticReport: false,
			configSummary: false,
			envinfo: true,
			...config.collect,
		},
		store: { enabled: true, maxReports: 100, ...config.store },
		sanitize: { enabled: true, ...config.sanitize },
		dedupe: { enabled: true, searchDiscussions: false, ...config.dedupe },
		branding: { showName: false, ...config.branding },
		issue: {
			...config.issue,
			sections: config.issue?.sections ?? preset?.issue?.sections,
		},
	}
}
