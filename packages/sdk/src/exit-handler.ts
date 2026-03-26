import type { ErrorReport } from '@cluvo/core'

interface ExitHandlerConfig {
	getPendingReports: () => Promise<ErrorReport[]>
	onPending: (reports: ErrorReport[]) => Promise<void>
	interceptProcessExit?: boolean
	timeout?: number
}

export function createExitHandler(config: ExitHandlerConfig): () => void {
	const timeout = config.timeout ?? 30_000
	let handling = false

	const beforeExitHandler = async () => {
		if (handling) return
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
				clearTimeout(timer)
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

			config.getPendingReports().then(async (pending) => {
				if (pending.length > 0) {
					let timer: ReturnType<typeof setTimeout> | undefined
					await Promise.race([
						config.onPending(pending),
						new Promise<void>((resolve) => {
							timer = setTimeout(resolve, timeout)
						}),
					])
					clearTimeout(timer)
				}
				originalExit!(exitCode as any)
			}).catch(() => {
				originalExit!(exitCode as any)
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
