import type { ErrorReport } from '@cluvo/core'

interface ExitHandlerConfig {
	getPendingReports: () => Promise<ErrorReport[]>
	onPending: (reports: ErrorReport[]) => Promise<void>
	interceptProcessExit?: boolean
	shouldIgnoreExitCode?: (code: number | string | null | undefined) => boolean
	timeout?: number
}

export function createExitHandler(config: ExitHandlerConfig): () => void {
	const timeout = config.timeout ?? 30_000
	let handling = false

	const beforeExitHandler = async (code?: number | string) => {
		if (handling) return
		if (config.shouldIgnoreExitCode?.(code ?? process.exitCode)) {
			handling = true
			return
		}
		handling = true
		try {
			const pending = await config.getPendingReports()
			if (pending.length > 0) {
				let timer: ReturnType<typeof setTimeout> | undefined
				await Promise.race([
					config.onPending(pending),
					new Promise<void>((resolve) => {
						timer = setTimeout(resolve, timeout)
					}),
				])
				if (timer) clearTimeout(timer)
			}
		} catch {
			// swallow – keep handling=true so beforeExit re-fires are ignored
		}
	}

	process.on('beforeExit', beforeExitHandler)

	let originalExit: typeof process.exit | undefined

	if (config.interceptProcessExit) {
		originalExit = process.exit

		process.exit = ((code?: number) => {
			const exitCode = code ?? process.exitCode ?? 0

			if (config.shouldIgnoreExitCode?.(exitCode)) {
				originalExit?.(exitCode)
				return
			}

			config
				.getPendingReports()
				.then(async (pending) => {
					if (pending.length > 0) {
						let timer: ReturnType<typeof setTimeout> | undefined
						await Promise.race([
							config.onPending(pending),
							new Promise<void>((resolve) => {
								timer = setTimeout(resolve, timeout)
							}),
						])
						if (timer) clearTimeout(timer)
					}
					originalExit?.(exitCode)
				})
				.catch(() => {
					originalExit?.(exitCode)
				})
		}) as typeof process.exit
	}

	return () => {
		process.removeListener('beforeExit', beforeExitHandler)
		if (originalExit) {
			process.exit = originalExit
			originalExit = undefined
		}
	}
}
