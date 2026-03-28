import {
	publish as corePublish,
	type DraftPayload,
	type ErrorReport,
	type PresenterAction,
	type Store,
} from '@cluvo/core'

interface ActionContext {
	report: ErrorReport
	draft: DraftPayload
	repo: string
	storeDir: string
	store: Store
}

export async function handlePresenterAction(
	action: PresenterAction | null,
	context: ActionContext,
): Promise<void> {
	const { report, draft, repo, storeDir, store } = context

	if (!action || action.type === 'cancel') {
		await store.updateStatus(report.app.name, report.id, 'dismissed')
		return
	}

	switch (action.type) {
		case 'view': {
			const { openBrowser } = await import('@cluvo/core')
			try {
				await openBrowser(action.issue.url)
			} catch {}
			break
		}
		case 'react':
			await addReaction(repo, action.issue.number)
			break
		case 'open':
			await corePublish(draft, { repo, mode: 'browser' })
			await store.updateStatus(report.app.name, report.id, 'submitted')
			break
		case 'gh':
			await corePublish(draft, { repo, mode: 'gh' })
			await store.updateStatus(report.app.name, report.id, 'submitted')
			break
		case 'save': {
			const { saveReportFile } = await import('@cluvo/core')
			const path = `${storeDir}/drafts/cluvo-report-${Date.now()}.md`
			await saveReportFile(draft, path)
			process.stdout.write(`Saved to ${path}\n`)
			await store.updateStatus(report.app.name, report.id, 'dismissed')
			break
		}
	}
}

async function addReaction(repo: string, issueNumber: number): Promise<void> {
	const { checkGhAuth, getGithubToken } = await import('@cluvo/core')

	if (await checkGhAuth()) {
		const { execFile } = await import('node:child_process')
		await new Promise<void>((resolve) => {
			execFile(
				'gh',
				['api', `repos/${repo}/issues/${issueNumber}/reactions`, '-f', 'content=+1'],
				() => resolve(),
			)
		})
		return
	}

	const token = getGithubToken()
	if (token) {
		await fetch(`https://api.github.com/repos/${repo}/issues/${issueNumber}/reactions`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: 'application/vnd.github.v3+json',
				'Content-Type': 'application/json',
				'User-Agent': 'cluvo',
			},
			body: JSON.stringify({ content: '+1' }),
		})
	}
}
