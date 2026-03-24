// Types

// Collector
export {
	captureError,
	collectApp,
	collectCommand,
	collectEnvironment,
	installGlobalHandlers,
} from './collector/index.js'
export type { DiagnosticSummary } from './diagnostic/index.js'
// Diagnostic
export { collectDiagnostic } from './diagnostic/index.js'
// Formatter
export { DEFAULT_SECTIONS, formatBody, formatTitle, SECTION_RENDERERS } from './formatter/index.js'
// Matcher
export { match, normalizeQuery, searchIssues } from './matcher/index.js'
export type { PresenterAction } from './presenter/index.js'
// Presenter
export {
	handleNonInteractive,
	promptUser,
	renderDetails,
	renderPromptMessage,
	renderSummary,
} from './presenter/index.js'
export type { PublishOptions, PublishResult } from './publisher/index.js'
// Publisher
export {
	buildBrowserUrl,
	buildGhArgs,
	checkGhAuth,
	checkGhInstalled,
	getGithubToken,
	isAuthAvailable,
	openBrowser,
	publish,
	renderTerminalDraft,
	saveReportFile,
} from './publisher/index.js'
// Sanitizer
export { DEFAULT_RULES, sanitize } from './sanitizer/index.js'
// Store
export { Store } from './store/index.js'
export * from './types.js'
