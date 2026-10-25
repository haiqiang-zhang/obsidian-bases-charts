import tseslint from 'typescript-eslint';
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";

export default defineConfig(
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
		},
	},
	{
		files: ["**/*.{ts,tsx,mts,cts}"],
		languageOptions: {
			parserOptions: {
				projectService: {
					allowDefaultProject: [
						'eslint.config.mts',
					]
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json']
			},
		},
	},
	// Obsidian's runtime rules apply to the plugin, not the website or Node tools.
	...[...obsidianmd.configs.recommended].map(config => ({
		...config,
		ignores: [...(config.ignores ?? []), "site/**", "tests/**", "images/**", "**/*.mjs", "eslint.config.mts"],
	})),
	{
		files: ["site/**/*.{ts,tsx}", "eslint.config.mts"],
		extends: [tseslint.configs.recommendedTypeChecked],
		rules: { "@typescript-eslint/no-deprecated": "error" },
	},
	{
		files: ["**/*.mjs"],
		extends: [js.configs.recommended],
		languageOptions: { globals: globals.node },
	},
	globalIgnores([
		"node_modules",
		"dist",
		"site/build/**",
		"site/.rspress/**",
		"site/docs/public/gallery/**",
		"gallery/**",
		"esbuild.config.mjs",
		"eslint.config.js",
		"exampleData",
		"exampleVault",
		"workflow",
		"versions.json",
		"main.js",
	]),
);
