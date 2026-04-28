import type { ErrorPayload } from '../types.js'
import { captureError } from './capture-error.js'

type ErrorCallback = (payload: ErrorPayload, origin: string, original: unknown) => void

export function installGlobalHandlers(callback: ErrorCallback): () => void {
	const onUncaught = (error: Error) => {
		callback(captureError(error), 'uncaughtException', error)
	}
	const onUnhandled = (reason: unknown) => {
		callback(captureError(reason), 'unhandledRejection', reason)
	}

	process.on('uncaughtException', onUncaught)
	process.on('unhandledRejection', onUnhandled)

	return () => {
		process.off('uncaughtException', onUncaught)
		process.off('unhandledRejection', onUnhandled)
	}
}
