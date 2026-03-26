import { mkdtemp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ErrorReport } from '@cluvo/core'
import type { TestEnvironment } from './environments.js'
import { environments } from './environments.js'

export interface RunResult {
  exitCode: number
  stdout: string
  stderr: string
}

const PROJECT_ROOT = join(import.meta.dir, '..', '..', '..')

export async function runScript(
  code: string,
  options: {
    env?: TestEnvironment
    storeDir?: string
    timeout?: number
    prependCode?: string
  } = {},
): Promise<RunResult> {
  const { env: testEnv = environments.pipe, storeDir, timeout = 15000, prependCode = '' } = options

  const scriptDir = await mkdtemp(join(tmpdir(), 'cluvo-e2e-script-'))
  const scriptPath = join(scriptDir, 'test-script.ts')

  const fullCode = `${prependCode}\n${code}`
  await writeFile(scriptPath, fullCode, 'utf-8')

  const envVars: Record<string, string | undefined> = {
    ...process.env,
    ...testEnv.env,
    HOME: storeDir ?? testEnv.env.HOME ?? process.env.HOME,
  }

  if (storeDir) {
    envVars.CLUVO_TEST_STORE_DIR = storeDir
  }

  for (const [k, v] of Object.entries(envVars)) {
    if (v === undefined) delete envVars[k]
  }

  const proc = Bun.spawn(['bun', 'run', scriptPath], {
    cwd: PROJECT_ROOT,
    env: envVars as Record<string, string>,
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => {
      proc.kill()
      reject(new Error(`Script timed out after ${timeout}ms`))
    }, timeout),
  )

  const resultPromise = (async () => {
    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()
    const exitCode = await proc.exited
    return { exitCode, stdout, stderr }
  })()

  return Promise.race([resultPromise, timeoutPromise])
}

/**
 * Run a cluvo CLI command as a subprocess.
 * Note: HOME is set to storeDir, so CLI resolves its store at <storeDir>/.cluvo.
 * Seed reports under <storeDir>/.cluvo/reports/<appName>/ for CLI tests.
 */
export async function runCluvo(
  args: string[],
  options: {
    env?: TestEnvironment
    storeDir?: string
    timeout?: number
  } = {},
): Promise<RunResult> {
  const { env: testEnv = environments.pipe, storeDir, timeout = 15000 } = options

  const cliBin = join(PROJECT_ROOT, 'packages', 'cli', 'src', 'bin.ts')

  const envVars: Record<string, string | undefined> = {
    ...process.env,
    ...testEnv.env,
    HOME: storeDir ?? testEnv.env.HOME ?? process.env.HOME,
  }

  if (storeDir) {
    envVars.CLUVO_TEST_STORE_DIR = storeDir
  }

  for (const [k, v] of Object.entries(envVars)) {
    if (v === undefined) delete envVars[k]
  }

  const proc = Bun.spawn(['bun', 'run', cliBin, ...args], {
    cwd: PROJECT_ROOT,
    env: envVars as Record<string, string>,
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => {
      proc.kill()
      reject(new Error(`CLI timed out after ${timeout}ms`))
    }, timeout),
  )

  const resultPromise = (async () => {
    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()
    const exitCode = await proc.exited
    return { exitCode, stdout, stderr }
  })()

  return Promise.race([resultPromise, timeoutPromise])
}

export async function seedReports(
  storeDir: string,
  appName: string,
  reports: ErrorReport[],
): Promise<void> {
  const reportDir = join(storeDir, 'reports', appName)
  await mkdir(reportDir, { recursive: true })
  for (const report of reports) {
    await writeFile(join(reportDir, `${report.id}.json`), JSON.stringify(report, null, 2), 'utf-8')
  }
}

export async function readReports(storeDir: string, appName: string): Promise<ErrorReport[]> {
  const reportDir = join(storeDir, 'reports', appName)
  try {
    const files = await readdir(reportDir)
    const reports: ErrorReport[] = []
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      const content = await readFile(join(reportDir, file), 'utf-8')
      reports.push(JSON.parse(content))
    }
    return reports
  } catch {
    return []
  }
}

export async function readDrafts(storeDir: string): Promise<string[]> {
  const draftDir = join(storeDir, 'drafts')
  try {
    const files = await readdir(draftDir)
    return files
  } catch {
    return []
  }
}

export async function readDraftContent(storeDir: string, filename: string): Promise<string> {
  return readFile(join(storeDir, 'drafts', filename), 'utf-8')
}

export async function createTempStoreDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'cluvo-e2e-'))
}
