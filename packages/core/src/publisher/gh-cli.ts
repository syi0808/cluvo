import { execFile } from 'node:child_process'
import type { DraftPayload } from '../types.js'

export function buildGhArgs(draft: DraftPayload, repo: string): string[] {
	const args = ['issue', 'create', '--repo', repo, '--title', draft.title, '--body', draft.body]
	if (draft.labels?.length) {
		for (const label of draft.labels) {
			args.push('--label', label)
		}
	}
	return args
}

export async function ghCreate(draft: DraftPayload, repo: string): Promise<string> {
	const args = buildGhArgs(draft, repo)
	return new Promise((resolve, reject) => {
		execFile('gh', args, (error, stdout, stderr) => {
			if (error) reject(new Error(`gh issue create failed: ${stderr}`))
			else resolve(stdout.trim())
		})
	})
}
