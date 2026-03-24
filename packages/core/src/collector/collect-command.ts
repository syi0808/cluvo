import type { CommandContext } from '../types.js'

export function collectCommand(argv?: string[]): CommandContext {
  const args = argv ?? process.argv
  const userArgs = args.slice(2)
  return {
    command: userArgs[0],
    subcommand: userArgs[1],
    argv: userArgs,
  }
}
