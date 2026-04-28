import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

const entrypoint = path.join(packageDir, 'src/bin.ts')
const nodeBuiltins = (await import('node:module')).builtinModules.flatMap((m) => [m, `node:${m}`])

// CJS build
await Bun.build({
	entrypoints: [entrypoint],
	outdir: distDir,
	format: 'cjs',
	target: 'node',
	splitting: false,
	external: [...nodeBuiltins, '@cluvo/core', '@cluvo/sdk'],
	naming: 'bin.cjs',
})

const binPath = path.join(distDir, 'bin.cjs')
const bin = readFileSync(binPath, 'utf-8')
if (!bin.startsWith('#!')) {
	writeFileSync(binPath, `#!/usr/bin/env node\n${bin}`)
}

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

console.log('@cluvo/cli build complete')
