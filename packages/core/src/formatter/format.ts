import type { ErrorReport, ErrorPayload } from '../types.js'
import { SECTION_RENDERERS, DEFAULT_SECTIONS } from './sections.js'

type TitleFormatter = (ctx: { command?: string; error: ErrorPayload }) => string

export function formatTitle(report: ErrorReport, customFormatter?: TitleFormatter): string {
  if (customFormatter) {
    return customFormatter({ command: report.command?.command, error: report.error })
  }
  const prefix = report.command?.command ? `[${report.command.command}] ` : ''
  const message =
    report.error.message.length > 80
      ? report.error.message.slice(0, 77) + '...'
      : report.error.message
  return `${prefix}${report.error.name}: ${message}`
}

export function formatBody(
  report: ErrorReport,
  options?: { sections?: string[] },
): string {
  const sectionNames = options?.sections ?? DEFAULT_SECTIONS
  const parts: string[] = []

  for (const name of sectionNames) {
    const renderer = SECTION_RENDERERS[name]
    if (!renderer) continue
    const content = renderer(report)
    if (content) parts.push(content)
  }

  return parts.join('\n')
}
