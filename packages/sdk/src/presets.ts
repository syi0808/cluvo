import type { Preset, ReporterConfig } from '@cluvo/core'

type PresetDefaults = Partial<Pick<ReporterConfig, 'interactive' | 'collect' | 'issue'>> & {
	presenter: 'terminal' | null
}

const CLI_SECTIONS = [
	'summary',
	'environment',
	'command',
	'stackTrace',
	'causeChain',
	'sanitizedNotice',
]
const SDK_SECTIONS = ['summary', 'environment', 'stackTrace', 'causeChain', 'sanitizedNotice']

// presenter field is resolved in the Reporter constructor during presenter initialization
export const PRESETS: Record<Preset, PresetDefaults> = {
	cli: {
		interactive: 'auto',
		collect: { argv: true },
		issue: { sections: CLI_SECTIONS },
		presenter: 'terminal',
	},
	sdk: {
		interactive: 'never',
		collect: { argv: false },
		issue: { sections: SDK_SECTIONS },
		presenter: null,
	},
}
