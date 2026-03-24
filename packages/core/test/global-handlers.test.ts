import { describe, expect, test, mock, spyOn, afterEach } from 'bun:test'
import type { ErrorPayload } from '../src/types.js'
import { installGlobalHandlers } from '../src/collector/global-handlers.js'

describe('installGlobalHandlers', () => {
  let onSpy: ReturnType<typeof spyOn>
  let offSpy: ReturnType<typeof spyOn>

  afterEach(() => {
    onSpy?.mockRestore()
    offSpy?.mockRestore()
  })

  test('registers uncaughtException listener', () => {
    onSpy = spyOn(process, 'on').mockReturnValue(process)
    offSpy = spyOn(process, 'off').mockReturnValue(process)

    installGlobalHandlers(mock())

    const events = onSpy.mock.calls.map((c) => c[0])
    expect(events).toContain('uncaughtException')
  })

  test('registers unhandledRejection listener', () => {
    onSpy = spyOn(process, 'on').mockReturnValue(process)
    offSpy = spyOn(process, 'off').mockReturnValue(process)

    installGlobalHandlers(mock())

    const events = onSpy.mock.calls.map((c) => c[0])
    expect(events).toContain('unhandledRejection')
  })

  test('callback receives ErrorPayload + uncaughtException origin when invoked with Error', () => {
    onSpy = spyOn(process, 'on').mockReturnValue(process)
    offSpy = spyOn(process, 'off').mockReturnValue(process)

    const callback = mock<(payload: ErrorPayload, origin: string) => void>()
    installGlobalHandlers(callback)

    const uncaughtCall = onSpy.mock.calls.find((c) => c[0] === 'uncaughtException')!
    const listener = uncaughtCall[1] as (error: Error) => void

    const error = new TypeError('test error')
    listener(error)

    expect(callback).toHaveBeenCalledTimes(1)
    const [payload, origin] = callback.mock.calls[0]
    expect(origin).toBe('uncaughtException')
    expect(payload.name).toBe('TypeError')
    expect(payload.message).toBe('test error')
  })

  test('callback receives ErrorPayload + unhandledRejection origin when invoked with non-Error', () => {
    onSpy = spyOn(process, 'on').mockReturnValue(process)
    offSpy = spyOn(process, 'off').mockReturnValue(process)

    const callback = mock<(payload: ErrorPayload, origin: string) => void>()
    installGlobalHandlers(callback)

    const rejectionCall = onSpy.mock.calls.find((c) => c[0] === 'unhandledRejection')!
    const listener = rejectionCall[1] as (reason: unknown) => void

    listener('something went wrong')

    expect(callback).toHaveBeenCalledTimes(1)
    const [payload, origin] = callback.mock.calls[0]
    expect(origin).toBe('unhandledRejection')
    expect(payload.name).toBe('Error')
    expect(payload.message).toBe('something went wrong')
  })

  test('uninstall function removes both listeners', () => {
    onSpy = spyOn(process, 'on').mockReturnValue(process)
    offSpy = spyOn(process, 'off').mockReturnValue(process)

    const uninstall = installGlobalHandlers(mock())
    uninstall()

    const removedEvents = offSpy.mock.calls.map((c) => c[0])
    expect(removedEvents).toContain('uncaughtException')
    expect(removedEvents).toContain('unhandledRejection')
    expect(offSpy).toHaveBeenCalledTimes(2)
  })
})
