import { join } from 'node:path'
import type { ReporterConfig } from '@cluvo/core'
import { PRESETS } from './presets.js'

export interface InternalConfig extends ReporterConfig {
	_storeDir?: string
}

export function resolveConfig(
	config: InternalConfig,
): Required<Pick<ReporterConfig, 'mode' | 'interactive' | 'nonInteractive'>> &
	InternalConfig & { storeDir: string } {
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
