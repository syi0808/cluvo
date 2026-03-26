import { arch, platform, release } from 'node:os'
import type { EnvironmentPayload } from '../types.js'

export function collectEnvironment(): EnvironmentPayload {
	return {
		os: `${platform()} ${release()}`,
		arch: arch(),
		runtimeVersion: typeof Bun !== 'undefined' ? Bun.version : process.version,
		shell: process.env.SHELL,
		ci: !!(
			process.env.CI ||
			process.env.GITHUB_ACTIONS ||
			process.env.GITLAB_CI ||
			process.env.JENKINS_URL
		),
		packageManager: detectPackageManager(),
	}
}

function detectPackageManager(): string | undefined {
	const ua = process.env.npm_config_user_agent
	if (!ua) return undefined
	const match = ua.match(/^(\w+)\/[\d.]+/)
	return match?.[1]
}
