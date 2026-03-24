import type { ErrorReport, SanitizeRule } from '../types.js'
import { DEFAULT_RULES, getHomeRule, ARGV_SENSITIVE_FLAGS } from './rules.js'

export function sanitize(report: ErrorReport, customRules?: SanitizeRule[]): ErrorReport {
  const rules = [...DEFAULT_RULES, getHomeRule(), ...(customRules ?? [])]
  const sanitizedFields: string[] = []

  const sanitizedMessage = applyRules(report.error.message, rules)
  if (sanitizedMessage !== report.error.message) sanitizedFields.push('error.message')

  const sanitizedStack = report.error.stack ? applyRules(report.error.stack, rules) : undefined
  if (sanitizedStack !== report.error.stack) sanitizedFields.push('error.stack')

  const sanitizedCauseChain = report.error.causeChain?.map((cause) => applyRules(cause, rules))

  const sanitizedCommand = report.command ? sanitizeCommand(report.command, sanitizedFields) : undefined

  return {
    ...report,
    error: {
      ...report.error,
      message: sanitizedMessage,
      stack: sanitizedStack,
      causeChain: sanitizedCauseChain,
    },
    command: sanitizedCommand,
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
    if (ARGV_SENSITIVE_FLAGS.has(command.argv![i - 1]!)) {
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
