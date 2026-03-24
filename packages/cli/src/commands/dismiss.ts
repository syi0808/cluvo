import type { Store } from '@cluvo/core'

export async function dismissReport(store: Store, appName: string, id: string): Promise<void> {
  await store.updateStatus(appName, id, 'dismissed')
}
