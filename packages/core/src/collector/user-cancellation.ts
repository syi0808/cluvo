const CANCELLATION_NAMES = new Set([
	'AbortError',
	'KeyboardInterrupt',
	'CancelError',
	'ExitPromptError',
	'PromptCancelledError',
])
const CANCELLATION_CODES = new Set([
	'SIGINT',
	'ABORT_ERR',
	'ERR_ABORTED',
	'ECANCELED',
	'E_CANCELLED',
	'ABORTED',
])

const CANCELLATION_MESSAGE =
	/\b(SIGINT|keyboard interrupt|operation aborted|prompt (cancelled|canceled)|user (cancelled|canceled|closed|force closed)|force closed the prompt|interrupted by user|(cancelled|canceled) by user)\b/i

export function isUserCancellation(error: unknown): boolean {
	if (error === 130 || error === '130') return true

	if (typeof error === 'string') {
		return CANCELLATION_MESSAGE.test(error)
	}

	if (error === null || typeof error !== 'object') return false

	const record = error as Record<string, unknown>

	if (matchesCancellationText(record.name, CANCELLATION_NAMES)) return true
	if (matchesCancellationText(record.code, CANCELLATION_CODES)) return true
	if (matchesCancellationText(record.signal, CANCELLATION_CODES)) return true
	if (record.status === 130 || record.exitCode === 130) return true
	if (record.status === '130' || record.exitCode === '130') return true

	if (typeof record.message === 'string' && CANCELLATION_MESSAGE.test(record.message)) {
		return true
	}

	if ('cause' in record && isUserCancellation(record.cause)) return true

	return false
}

export function isUserCancellationExitCode(code: number | string | null | undefined): boolean {
	return code === 130 || code === '130'
}

function matchesCancellationText(value: unknown, candidates: Set<string>): boolean {
	return typeof value === 'string' && candidates.has(value)
}
