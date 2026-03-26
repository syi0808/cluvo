#!/usr/bin/env bun
import { join } from 'node:path'
import type { ErrorReport } from '@cluvo/core'
import { Store } from '@cluvo/core'
import { cleanReports } from './commands/clean.js'
import { dismissReport } from './commands/dismiss.js'
import { formatReportList, listReports } from './commands/list.js'
import { formatReportDetail, showReport } from './commands/show.js'
import { submitAll, submitReport } from './commands/submit.js'

const STORE_DIR = join(process.env.HOME || '.', '.cluvo')

async function main() {
	const args = process.argv.slice(2)
	const command = args[0]
	const store = new Store(STORE_DIR)

	switch (command) {
		case 'list': {
			const app = getFlag(args, '--app')
			const all = args.includes('--all')
			const reports = await listReports(store, { app: app ?? undefined, all })
			console.log(formatReportList(reports))
			break
		}
		case 'show': {
			const id = args[1]
			if (!id) {
				console.error('Usage: cluvo show <id>')
				return exitWithCode(1)
			}
			const report = await showReport(store, id)
			if (!report) {
				console.error(`Report ${id} not found`)
				return exitWithCode(1)
			}
			console.log(formatReportDetail(report))
			break
		}
		case 'submit': {
			const repo = getFlag(args, '--repo')
			if (!repo) {
				console.error('--repo is required')
				return exitWithCode(1)
			}
			if (args.includes('--all')) {
				const confirmEach = async (report: ErrorReport): Promise<boolean> => {
					process.stdout.write(
						`Submit ${report.id} (${report.error.name}: ${report.error.message.slice(0, 50)})? (Y/n) `,
					)
					return new Promise((resolve) => {
						if (!process.stdin.isTTY) {
							resolve(true)
							return
						}
						process.stdin.setRawMode(true)
						process.stdin.resume()
						process.stdin.once('data', (data) => {
							process.stdin.setRawMode(false)
							process.stdin.pause()
							const char = data.toString().trim().toLowerCase()
							process.stdout.write(char === 'n' ? 'n\n' : 'Y\n')
							resolve(char !== 'n')
						})
					})
				}
				const { submitted, skipped, failed } = await submitAll(store, { repo }, confirmEach)
				const parts = [`Submitted ${submitted} report(s)`]
				if (skipped > 0) parts.push(`${skipped} skipped`)
				if (failed > 0) parts.push(`${failed} failed`)
				console.log(parts.join(', '))
			} else {
				const id = args[1]
				if (!id) {
					console.error('Usage: cluvo submit <id> --repo owner/repo')
					return exitWithCode(1)
				}
				const report = await showReport(store, id)
				if (!report) {
					console.error(`Report ${id} not found`)
					return exitWithCode(1)
				}
				const result = await submitReport(store, report, { repo })
				console.log(result ? `Submitted: ${result}` : 'Submitted (saved locally)')
			}
			break
		}
		case 'dismiss': {
			const id = args[1]
			if (!id) {
				console.error('Usage: cluvo dismiss <id>')
				return exitWithCode(1)
			}
			const report = await showReport(store, id)
			if (!report) {
				console.error(`Report ${id} not found`)
				return exitWithCode(1)
			}
			await dismissReport(store, report.app.name, id)
			console.log(`Dismissed ${id}`)
			break
		}
		case 'clean': {
			const olderThan = getFlag(args, '--older-than')
			const days = olderThan ? parseInt(olderThan.replace('d', ''), 10) : undefined
			const removed = await cleanReports(store, { olderThanDays: days })
			console.log(`Cleaned ${removed} report(s)`)
			break
		}
		default:
			console.log(`Usage: cluvo <list|show|submit|dismiss|clean> [options]

Commands:
  list [--app name] [--all]     List stored error reports
  show <id>                     Show report details
  submit <id> --repo owner/repo Submit report as GitHub issue
  dismiss <id>                  Mark report as dismissed
  clean [--older-than 30d]      Remove submitted/dismissed reports`)
	}
}

export function getFlag(args: string[], flag: string): string | null {
	const idx = args.indexOf(flag)
	return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null
}

function exitWithCode(code: number): never {
	process.exit(code)
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
