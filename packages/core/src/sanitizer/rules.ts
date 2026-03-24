import type { SanitizeRule } from '../types.js'

export const DEFAULT_RULES: SanitizeRule[] = [
	{
		name: 'bearer-token',
		pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g,
		replacement: 'Bearer [REDACTED]',
	},
	{
		name: 'github-token',
		pattern: /gh[ps]_[A-Za-z0-9_]{36,}/g,
		replacement: '[REDACTED]',
	},
	{
		name: 'generic-api-key',
		pattern: /(api[_-]?key|apikey|secret[_-]?key|access[_-]?token|auth[_-]?token)\s*[=:]\s*\S+/gi,
		replacement: '$1=[REDACTED]',
	},
	{
		name: 'password',
		pattern: /(password|passwd|pwd)\s*[=:]\s*\S+/gi,
		replacement: '$1=[REDACTED]',
	},
	{
		name: 'sk-token',
		pattern: /sk[_-](?:live|test)[_-][A-Za-z0-9]{10,}/g,
		replacement: '[REDACTED]',
	},
	{
		name: 'email',
		pattern: /[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Z|a-z]{2,})/g,
		replacement: '***@$1',
	},
	{
		name: 'private-key',
		pattern:
			/-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(RSA\s+)?PRIVATE\s+KEY-----/g,
		replacement: '[REDACTED PRIVATE KEY]',
	},
]

export function getHomeRule(): SanitizeRule {
	const home = process.env.HOME || process.env.USERPROFILE || ''
	if (!home) return { name: 'home-path', pattern: /(?!)/g, replacement: '' }
	return {
		name: 'home-path',
		pattern: new RegExp(home.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
		replacement: '~',
	}
}

export const ARGV_SENSITIVE_FLAGS = new Set([
	'--token',
	'--api-key',
	'--secret',
	'--password',
	'--auth',
	'-t',
	'--access-token',
	'--api-token',
])
