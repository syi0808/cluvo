import type { AppContext } from '../types.js'

export function collectApp(config: { name: string; version: string; gitSha?: string }): AppContext {
  return {
    name: config.name,
    version: config.version,
    runtime: typeof Bun !== 'undefined' ? 'bun' : 'node',
    gitSha: config.gitSha,
  }
}
