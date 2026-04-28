import type { ErrorReport, SanitizeRule } from '../types.js'
import { ARGV_SENSITIVE_FLAGS, DEFAULT_RULES, getHomeRule } from './rules.js'

export function sanitize(report: ErrorReport, customRules?: SanitizeRule[]): ErrorReport {
	const rules = [...DEFAULT_RULES, getHomeRule(), ...(customRules ?? [])]
	const sanitizedFields: string[] = []

	const sanitizedMessage = applyRules(report.error.message, rules)
	if (sanitizedMessage !== report.error.message) sanitizedFields.push('error.message')

	const sanitizedStack = report.error.stack ? applyRules(report.error.stack, rules) : undefined
	if (sanitizedStack !== report.error.stack) sanitizedFields.push('error.stack')

	const sanitizedCauseChain = report.error.causeChain?.map((cause) => applyRules(cause, rules))

	const sanitizedCommand = report.command
		? sanitizeCommand(report.command, sanitizedFields)
		: undefined
	const sanitizedMetadata = report.metadata
		? sanitizeUnknown(report.metadata, rules, 'metadata', sanitizedFields)
		: undefined

	return {
		...report,
		error: {
			...report.error,
			message: sanitizedMessage,
			stack: sanitizedStack,
			causeChain: sanitizedCauseChain,
		},
		command: sanitizedCommand,
		metadata: sanitizedMetadata as Record<string, unknown> | undefined,
		sanitizedFields: [...report.sanitizedFields, ...sanitizedFields],
	}
}

function applyRules(text: string, rules: SanitizeRule[]): string {
	let result = text
	for (const rule of rules) {
		const pattern = new RegExp(rule.pattern.source, rule.pattern.flags)
		result = result.replace(pattern, rule.replacement)
	}
	return result
}

function sanitizeCommand(
	command: { command?: string; subcommand?: string; argv?: string[] },
	sanitizedFields: string[],
): { command?: string; subcommand?: string; argv?: string[] } {
	if (!command.argv) return { ...command }

	let redacted = false
	const sanitizedArgv = command.argv.map((arg, i) => {
		const inlineFlag = arg.match(/^([^=]+)=(.*)$/)
		if (inlineFlag && ARGV_SENSITIVE_FLAGS.has(inlineFlag[1])) {
			redacted = true
			return `${inlineFlag[1]}=[REDACTED]`
		}
		if (command.argv && ARGV_SENSITIVE_FLAGS.has(command.argv[i - 1])) {
			redacted = true
			return '[REDACTED]'
		}
		return arg
	})

	if (redacted) sanitizedFields.push('command.argv')

	return {
		...command,
		argv: sanitizedArgv,
	}
}

function sanitizeUnknown(
	value: unknown,
	rules: SanitizeRule[],
	path: string,
	sanitizedFields: string[],
	seen = new WeakSet<object>(),
): unknown {
	if (typeof value === 'string') {
		const sanitized = applyRules(value, rules)
		if (sanitized !== value) sanitizedFields.push(path)
		return sanitized
	}

	if (typeof value === 'bigint') return value.toString()
	if (value === null || typeof value !== 'object') return value

	if (seen.has(value)) {
		sanitizedFields.push(path)
		return '[Circular]'
	}
	seen.add(value)

	if (value instanceof Date) return value.toISOString()

	if (Array.isArray(value)) {
		const sanitized = value.map((item, index) =>
			sanitizeUnknown(item, rules, `${path}[${index}]`, sanitizedFields, seen),
		)
		seen.delete(value)
		return sanitized
	}

	const sanitized: Record<string, unknown> = {}
	for (const [key, child] of Object.entries(value)) {
		sanitized[key] = sanitizeUnknown(child, rules, `${path}.${key}`, sanitizedFields, seen)
	}
	seen.delete(value)
	return sanitized
}
