import { defineConfig } from 'pubm'
import { externalVersionSync } from '@pubm/plugin-external-version-sync'

export default defineConfig({
	versioning: 'fixed',
	plugins: [
		externalVersionSync({
			targets: [
				{ file: 'plugins/cluvo-plugin/.claude-plugin/plugin.json', jsonPath: 'version' },
			],
		}),
	],
})
