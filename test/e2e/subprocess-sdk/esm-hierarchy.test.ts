import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { environments } from '../helpers/environments.js'
import { mockFetchScript } from '../helpers/mock-fetch.js'
import { createTempStoreDir, readReports, SDK_IMPORT } from '../helpers/subprocess.js'

const PROJECT_ROOT = join(import.meta.dir, '..', '..', '..')
const SUBPROCESS_PRELOAD = join(PROJECT_ROOT, 'test', 'subprocess-preload.ts')

async function runMultiFile(
	files: Record<string, string>,
	entrypoint: string,
	options: { storeDir?: string } = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const dir = await mkdtemp(join(tmpdir(), 'cluvo-e2e-esm-'))
	for (const [name, content] of Object.entries(files)) {
		await writeFile(join(dir, name), content, 'utf-8')
	}

	const envVars: Record<string, string | undefined> = {
		...process.env,
		...environments.pipe.env,
		HOME: options.storeDir ?? process.env.HOME,
	}
	if (options.storeDir) envVars.CLUVO_TEST_STORE_DIR = options.storeDir
	for (const [k, v] of Object.entries(envVars)) {
		if (v === undefined) delete envVars[k]
	}

	const proc = Bun.spawn(['bun', 'run', '-r', SUBPROCESS_PRELOAD, join(dir, entrypoint)], {
		cwd: PROJECT_ROOT,
		env: envVars as Record<string, string>,
		stdout: 'pipe',
		stderr: 'pipe',
	})
	const stdout = await new Response(proc.stdout).text()
	const stderr = await new Response(proc.stderr).text()
	const exitCode = await proc.exited
	await rm(dir, { recursive: true, force: true })
	return { exitCode, stdout, stderr }
}

describe('E2E: subprocess-sdk/esm-hierarchy (real multi-file import chain)', () => {
	let storeDir: string

	beforeEach(async () => {
		storeDir = await createTempStoreDir()
	})

	afterEach(async () => {
		await rm(storeDir, { recursive: true, force: true })
	})

	test('parent-child hierarchy detected via ESM import depth', async () => {
		// child-lib.ts is imported by parent-cli.ts
		// ESM post-order: child-lib runs first (deeper), parent-cli runs second (shallower)
		// Stack depth at `new Reporter()` differs → hierarchy auto-detected
		const result = await runMultiFile(
			{
				'child-lib.ts': `
${mockFetchScript()}
import { Reporter } from '${SDK_IMPORT}';
const storeDir = process.env.CLUVO_TEST_STORE_DIR!;
export const childReporter = new Reporter({
  repo: 'test-owner/test-repo',
  app: { name: 'child-lib', version: '0.1.0' },
  preset: 'sdk',
  store: { enabled: true },
  _storeDir: storeDir,
});
`,
				'parent-cli.ts': `
import { childReporter } from './child-lib.js';
import { Reporter, getRegistry } from '${SDK_IMPORT}';
const storeDir = process.env.CLUVO_TEST_STORE_DIR!;

const parentReporter = new Reporter({
  repo: 'test-owner/test-repo',
  app: { name: 'parent-cli', version: '1.0.0' },
  childPolicy: 'absorb',
  interactive: 'never',
  nonInteractive: 'silent',
  store: { enabled: true },
  _storeDir: storeDir,
});

const registry = getRegistry();
const childEntry = registry.stack.find(e => e.id === 'child-lib');
const parent = childEntry ? registry.getParent(childEntry) : null;
console.log('child parent:', parent?.id ?? 'none');

await childReporter.reportError(new Error('child error'));
`,
			},
			'parent-cli.ts',
			{ storeDir },
		)

		expect(result.exitCode).toBe(0)
		expect(result.stdout.trim()).toBe('child parent: parent-cli')
		const childReports = await readReports(storeDir, 'child-lib')
		expect(childReports).toHaveLength(1)
	})

	test('3-level nesting: grandchild → child → parent via imports', async () => {
		const result = await runMultiFile(
			{
				'grandchild-lib.ts': `
${mockFetchScript()}
import { Reporter } from '${SDK_IMPORT}';
const storeDir = process.env.CLUVO_TEST_STORE_DIR!;
export const grandchildReporter = new Reporter({
  repo: 'test-owner/test-repo',
  app: { name: 'grandchild', version: '0.1.0' },
  preset: 'sdk',
  store: { enabled: true },
  _storeDir: storeDir,
});
`,
				'child-lib.ts': `
import { grandchildReporter } from './grandchild-lib.js';
import { Reporter } from '${SDK_IMPORT}';
const storeDir = process.env.CLUVO_TEST_STORE_DIR!;
export const childReporter = new Reporter({
  repo: 'test-owner/test-repo',
  app: { name: 'child', version: '0.1.0' },
  childPolicy: 'absorb',
  store: { enabled: true },
  _storeDir: storeDir,
});
export { grandchildReporter };
`,
				'parent-cli.ts': `
import { childReporter, grandchildReporter } from './child-lib.js';
import { Reporter, getRegistry } from '${SDK_IMPORT}';
const storeDir = process.env.CLUVO_TEST_STORE_DIR!;

const parentReporter = new Reporter({
  repo: 'test-owner/test-repo',
  app: { name: 'parent', version: '1.0.0' },
  childPolicy: 'absorb',
  interactive: 'never',
  nonInteractive: 'silent',
  store: { enabled: true },
  _storeDir: storeDir,
});

// Ensure imported reporters are evaluated (Bun lazy-evaluates unused imports)
void childReporter; void grandchildReporter;

const registry = getRegistry();
const gcEntry = registry.stack.find(e => e.id === 'grandchild');
const cEntry = registry.stack.find(e => e.id === 'child');
const gcParent = gcEntry ? registry.getParent(gcEntry) : null;
const cParent = cEntry ? registry.getParent(cEntry) : null;
console.log('grandchild parent:', gcParent?.id ?? 'none');
console.log('child parent:', cParent?.id ?? 'none');
`,
			},
			'parent-cli.ts',
			{ storeDir },
		)

		expect(result.exitCode).toBe(0)
		const lines = result.stdout.trim().split('\n')
		expect(lines).toContain('grandchild parent: child')
		expect(lines).toContain('child parent: parent')
	})
})
