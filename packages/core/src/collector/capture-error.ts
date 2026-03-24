import type { ErrorPayload } from '../types.js'

export function captureError(error: unknown): ErrorPayload {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      causeChain: extractCauseChain(error),
    }
  }

  const message = error === null ? 'null' : error === undefined ? 'undefined' : String(error)
  return {
    name: 'Error',
    message,
    stack: new Error(message).stack,
  }
}

function extractCauseChain(error: Error): string[] | undefined {
  const chain: string[] = []
  let current = error.cause
  while (current instanceof Error) {
    chain.push(current.message)
    current = current.cause
  }
  return chain.length > 0 ? chain : undefined
}
