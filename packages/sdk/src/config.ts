import type { ReporterConfig } from '@cluvo/core'
import { join } from 'node:path'

export interface InternalConfig extends ReporterConfig {
  _storeDir?: string
}

export function resolveConfig(config: InternalConfig): Required<
  Pick<ReporterConfig, 'mode' | 'interactive' | 'nonInteractive'>
> & InternalConfig & { storeDir: string } {
  return {
    ...config,
    mode: config.mode ?? 'browser',
    interactive: config.interactive ?? 'auto',
    nonInteractive: config.nonInteractive ?? 'save',
    storeDir: config._storeDir ?? join(process.env.HOME || '.', '.cluvo'),
    collect: { argv: true, diagnosticReport: false, configSummary: false, envinfo: true, ...config.collect },
    store: { enabled: true, maxReports: 100, ...config.store },
    sanitize: { enabled: true, ...config.sanitize },
    dedupe: { enabled: true, searchDiscussions: false, ...config.dedupe },
    branding: { showName: false, ...config.branding },
  }
}
