import { externalVersionSync } from '@pubm/plugin-external-version-sync'
import { defineConfig } from 'pubm'

export default defineConfig({
	versioning: 'fixed',
	plugins: [
		externalVersionSync({
			targets: [
			{ file: 'plugins/cluvo-plugin/.claude-plugin/plugin.json', jsonPath: 'version' },
			{ file: '.claude-plugin/marketplace.json', jsonPath: 'metadata.version' },
			{ file: '.claude-plugin/marketplace.json', jsonPath: 'plugins.0.version' },
		],
		}),
	],
})
