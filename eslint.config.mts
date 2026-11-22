import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
	globalIgnores([
		'node_modules',
		'dist',
		'esbuild.config.mjs',
		'version-bump.mjs',
		'versions.json',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'manifest.json'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		files: ['src/index/service.ts'],
		rules: {
			// The index service stays runtime-agnostic so unit tests can run it
			// in Node; the plugin injects window timers for popout support.
			'obsidianmd/no-global-this': 'off',
		},
	},
	{
		files: ['**/*.test.ts'],
		rules: {
			// Tests run in Node only, never inside Obsidian or on mobile.
			'obsidianmd/no-nodejs-modules': 'off',
		},
	},
);
