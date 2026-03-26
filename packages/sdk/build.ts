import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'

const packageDir = import.meta.dir
const distDir = path.join(packageDir, 'dist')

// Clean dist and tsbuildinfo
if (existsSync(distDir)) {
	rmSync(distDir, { recursive: true, force: true })
}
for (const info of ['tsconfig.tsbuildinfo', 'tsconfig.build.tsbuildinfo']) {
	const p = path.join(packageDir, info)
	if (existsSync(p)) rmSync(p)
}

const entrypoint = path.join(packageDir, 'src/index.ts')
const nodeBuiltins = (await import('node:module')).builtinModules.flatMap((m) => [m, `node:${m}`])

// ESM build
await Bun.build({
	entrypoints: [entrypoint],
	outdir: distDir,
	format: 'esm',
	target: 'node',
	splitting: false,
	external: [...nodeBuiltins, '@cluvo/core'],
	naming: 'index.js',
})

// CJS build
await Bun.build({
	entrypoints: [entrypoint],
	outdir: distDir,
	format: 'cjs',
	target: 'node',
	splitting: false,
	external: [...nodeBuiltins, '@cluvo/core'],
	naming: 'index.cjs',
})

// Types
const tscResult = Bun.spawnSync(
	['bunx', 'tsc', '--project', path.join(packageDir, 'tsconfig.build.json')],
	{
		cwd: packageDir,
		stdio: ['inherit', 'inherit', 'inherit'],
	},
)

if (tscResult.exitCode !== 0) {
	process.exit(1)
}

console.log('@cluvo/sdk build complete')
