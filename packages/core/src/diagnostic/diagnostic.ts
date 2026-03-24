export interface DiagnosticSummary {
  heapUsed: number
  heapTotal: number
  external: number
  activeHandles?: number
  uptime: number
}

export function collectDiagnostic(): DiagnosticSummary | null {
  try {
    if (typeof process.report?.getReport === 'function') {
      const report = process.report.getReport() as any
      const jsHeap = report?.javascriptHeap
      const mem = process.memoryUsage()
      return {
        heapUsed: jsHeap?.usedMemory || mem.heapUsed,
        heapTotal: jsHeap?.totalMemory || mem.heapTotal,
        external: mem.external,
        activeHandles: report?.libuv?.length,
        uptime: process.uptime(),
      }
    }

    const mem = process.memoryUsage()
    return {
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
      uptime: process.uptime(),
    }
  } catch {
    return null
  }
}
