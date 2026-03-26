import { mock } from 'bun:test'
import type { PresenterAdapter, PresenterAction, PromptContext } from '@cluvo/core'

export function createTestPresenter(
  action: PresenterAction | PresenterAction[] | null,
): PresenterAdapter & { prompt: ReturnType<typeof mock> } {
  let callIndex = 0

  const promptFn = mock(async (_ctx: PromptContext): Promise<PresenterAction | null> => {
    if (action === null) return null
    if (Array.isArray(action)) {
      const result = action[callIndex] ?? action[action.length - 1]
      callIndex++
      return result ?? null
    }
    return action
  })

  return { prompt: promptFn }
}
