import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PROJECT_ROOT = join(import.meta.dir, '..', '..')
const PACKAGES = ['core', 'sdk', 'cli'] as const

interface RunResult {
	exitCode: number
	stdout: string
	stderr: string
}

async function run(
	command: string,
	args: string[],
	options: { cwd?: string; env?: Record<string, string> } = {},
) {
	const proc = Bun.spawn([command, ...args], {
		cwd: options.cwd ?? PROJECT_ROOT,
		env: { ...process.env, ...options.env },
		stdout: 'pipe',
		stderr: 'pipe',
	})
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	])
	return { exitCode, stdout, stderr } satisfies RunResult
}

async function createConsumer(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), 'cluvo-compat-consumer-'))
	const scopeDir = join(dir, 'node_modules', '@cluvo')
	await mkdir(scopeDir, { recursive: true })

	for (const name of PACKAGES) {
		await symlink(
			join(PROJECT_ROOT, 'packages', name),
			join(scopeDir, name),
			process.platform === 'win32' ? 'junction' : 'dir',
		)
	}

	return dir
}

describe('dist package compatibility', () => {
	test('expected build outputs exist', () => {
		expect(existsSync(join(PROJECT_ROOT, 'packages/core/dist/index.js'))).toBe(true)
		expect(existsSync(join(PROJECT_ROOT, 'packages/core/dist/index.cjs'))).toBe(true)
		expect(existsSync(join(PROJECT_ROOT, 'packages/sdk/dist/index.js'))).toBe(true)
		expect(existsSync(join(PROJECT_ROOT, 'packages/sdk/dist/index.cjs'))).toBe(true)
		expect(existsSync(join(PROJECT_ROOT, 'packages/cli/dist/bin.cjs'))).toBe(true)
	})

	test('Node can import ESM and require CJS package exports from a consumer project', async () => {
		const consumer = await createConsumer()
		try {
			const esm = await run(
				'node',
				[
					'--input-type=module',
					'--eval',
					`
import { Reporter } from '@cluvo/sdk';
const reporter = new Reporter({
  repo: 'owner/repo',
  app: { name: 'compat-esm', version: '1.0.0' },
  interactive: 'never',
  nonInteractive: 'silent',
  store: { enabled: false },
  _skipTopLevelCheck: true,
});
const report = await reporter.reportError(new Error('esm smoke'));
if (report.error.message !== 'esm smoke') throw new Error('bad esm report');
console.log('esm-ok');
`,
				],
				{ cwd: consumer, env: { HOME: consumer } },
			)
			expect(esm).toMatchObject({ exitCode: 0 })
			expect(esm.stdout.trim()).toBe('esm-ok')

			const cjs = await run(
				'node',
				[
					'--eval',
					`
const { Reporter } = require('@cluvo/sdk');
(async () => {
  const reporter = new Reporter({
    repo: 'owner/repo',
    app: { name: 'compat-cjs', version: '1.0.0' },
    interactive: 'never',
    nonInteractive: 'silent',
    store: { enabled: false },
    _skipTopLevelCheck: true,
  });
  const report = await reporter.reportError(new Error('cjs smoke'));
  if (report.error.message !== 'cjs smoke') throw new Error('bad cjs report');
  console.log('cjs-ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
`,
				],
				{ cwd: consumer, env: { HOME: consumer } },
			)
			expect(cjs).toMatchObject({ exitCode: 0 })
			expect(cjs.stdout.trim()).toBe('cjs-ok')
		} finally {
			await rm(consumer, { recursive: true, force: true })
		}
	})

	test('built CLI bin runs under Node against the built package graph', async () => {
		const consumer = await createConsumer()
		try {
			const result = await run('node', [join(PROJECT_ROOT, 'packages/cli/dist/bin.cjs'), 'list'], {
				cwd: consumer,
				env: { HOME: consumer },
			})

			expect(result).toMatchObject({ exitCode: 0 })
			expect(result.stdout).toContain('No reports found.')
		} finally {
			await rm(consumer, { recursive: true, force: true })
		}
	})
})
