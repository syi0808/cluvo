import { writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { DraftPayload } from '../types.js'

export async function saveReportFile(
  draft: DraftPayload,
  path: string,
  format: 'markdown' | 'json' = 'markdown',
): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  if (format === 'json') {
    await writeFile(path, JSON.stringify(draft, null, 2))
  } else {
    const md = `# ${draft.title}\n\n${draft.body}\n`
    await writeFile(path, md)
  }
}
