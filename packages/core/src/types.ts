export interface ErrorReport {
	id: string
	createdAt: string
	app: AppContext
	error: ErrorPayload
	environment: EnvironmentPayload
	command?: CommandContext
	sanitizedFields: string[]
	matches?: ExistingIssue[]
	metadata?: Record<string, unknown>
	diagnostic?: {
		heapUsed: number
		heapTotal: number
		external: number
		activeHandles?: number
		uptime: number
	} | null
	status: 'pending' | 'prompted' | 'submitted' | 'dismissed'
	submittedAt?: string
	issueUrl?: string
}

export interface ErrorPayload {
	name: string
	message: string
	stack?: string
	causeChain?: string[]
}

export interface EnvironmentPayload {
	os: string
	arch: string
	runtimeVersion: string
	shell?: string
	ci?: boolean
	packageManager?: string
}

export interface AppContext {
	name: string
	version: string
	runtime: string
	gitSha?: string
}

export interface CommandContext {
	command?: string
	subcommand?: string
	argv?: string[]
}

export interface DraftPayload {
	title: string
	body: string
	labels?: string[]
}

export interface ExistingIssue {
	type: 'issue' | 'discussion'
	number: number
	title: string
	url: string
	state: 'open' | 'closed'
	labels: string[]
	createdAt: string
}

export interface MatchResult {
	found: boolean
	matches: ExistingIssue[]
}

export interface SanitizeRule {
	name: string
	pattern: RegExp
	replacement: string
}

export type ReporterMode = 'browser' | 'gh' | 'api' | 'file'
export type InteractiveMode = 'auto' | 'never'
export type NonInteractiveMode = 'save' | 'silent' | 'log'

export interface ReporterConfig {
	repo: string
	app: { name: string; version: string; gitSha?: string }
	preset?: Preset
	presenter?: PresenterAdapter | null
	childPolicy?: ChildPolicy
	mode?: ReporterMode
	interactive?: InteractiveMode
	nonInteractive?: NonInteractiveMode
	collect?: {
		argv?: boolean
		diagnosticReport?: boolean
		configSummary?: boolean
		envinfo?: boolean
	}
	sanitize?: {
		enabled?: boolean
		customRules?: SanitizeRule[]
	}
	issue?: {
		labels?: string[]
		title?: (ctx: { command?: string; error: ErrorPayload }) => string
		sections?: string[]
		template?: string
	}
	store?: {
		enabled?: boolean
		maxReports?: number
	}
	dedupe?: {
		enabled?: boolean
		searchDiscussions?: boolean
	}
	prompt?: {
		message?: string
		detailMessage?: string
		spacing?: number
	}
	branding?: {
		showName?: boolean
	}
}

export interface ErrorContext {
	command?: string
	subcommand?: string
	argv?: string[]
	metadata?: Record<string, unknown>
}

// === Presenter Adapter ===

export interface PresenterAdapter {
	prompt(context: PromptContext): Promise<PresenterAction | null>
}

export interface PromptContext {
	report: ErrorReport
	draft: DraftPayload
	authAvailable: boolean
	promptMessage?: string
	promptSpacing?: number
	branding?: { showName?: boolean }
}

export type PresenterAction =
	| { type: 'open' }
	| { type: 'gh' }
	| { type: 'view'; issue: ExistingIssue }
	| { type: 'react'; issue: ExistingIssue }
	| { type: 'save' }
	| { type: 'cancel' }

// === Options ===

export interface WrapOptions {
	rethrow?: boolean
}

export interface ExitHandlerOptions {
	interceptProcessExit?: boolean
	timeout?: number
}

export type Preset = 'cli' | 'sdk'

export type ChildPolicy = 'absorb' | 'passthrough' | 'silent'

export function generateReportId(): string {
	return `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
}
