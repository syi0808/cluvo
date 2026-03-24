import type { ErrorReport } from '../types.js'

export type SectionRenderer = (report: ErrorReport) => string | null

export const SECTION_RENDERERS: Record<string, SectionRenderer> = {
  summary: (report) => {
    return `## Summary\n\n**${report.error.name}:** ${report.error.message}\n`
  },

  environment: (report) => {
    const env = report.environment
    const lines = [
      `## Environment\n`,
      `| Field | Value |`,
      `|-------|-------|`,
      `| OS | ${env.os} |`,
      `| Architecture | ${env.arch} |`,
      `| Runtime | ${report.app.runtime} ${env.runtimeVersion} |`,
      `| App | ${report.app.name}@${report.app.version} |`,
    ]
    if (report.app.gitSha) lines.push(`| Git SHA | \`${report.app.gitSha}\` |`)
    if (env.shell) lines.push(`| Shell | ${env.shell} |`)
    if (env.packageManager) lines.push(`| Package Manager | ${env.packageManager} |`)
    if (env.ci) lines.push(`| CI | Yes |`)
    return lines.join('\n') + '\n'
  },

  command: (report) => {
    if (!report.command?.argv?.length) return null
    return `## Command\n\n\`\`\`\n${report.command.argv.join(' ')}\n\`\`\`\n`
  },

  stackTrace: (report) => {
    if (!report.error.stack) return null
    return `## Stack Trace\n\n\`\`\`\n${report.error.stack}\n\`\`\`\n`
  },

  causeChain: (report) => {
    if (!report.error.causeChain?.length) return null
    const items = report.error.causeChain.map((c, i) => `${i + 1}. ${c}`)
    return `## Cause Chain\n\n${items.join('\n')}\n`
  },

  sanitizedNotice: (report) => {
    if (report.sanitizedFields.length === 0) return null
    return `---\n\n> ${report.sanitizedFields.length} field(s) were sanitized before submission: ${report.sanitizedFields.join(', ')}\n`
  },
}

export const DEFAULT_SECTIONS = ['summary', 'environment', 'command', 'stackTrace', 'causeChain', 'sanitizedNotice']
