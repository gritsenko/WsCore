import { readFileSync } from "node:fs"
import { defineConfig } from "vite"

// The version shown in the lobby comes from package.json. The build id names one
// particular build: a deploy without a version bump is still an update for open pages.
const version: string = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version
const build = Date.now().toString(36)

export default defineConfig({
	define: {
		__APP_VERSION__: JSON.stringify(version),
		__APP_BUILD__: JSON.stringify(build),
	},
	plugins: [
		{
			// dist/version.json: what an open page polls to learn that a newer build is
			// deployed (src/utils/UpdateChecker.ts). Served no-cache by the server.
			name: "version-json",
			apply: "build",
			generateBundle() {
				this.emitFile({
					type: "asset",
					fileName: "version.json",
					source: JSON.stringify({ version, build }) + "\n",
				})
			},
		},
	],
	// Served from the site root by the ASP.NET server (wwwroot) and by the Vite dev
	// server; public/ assets are referenced by absolute URLs (`/knight/...`, `/map/...`).
	base: "/",
	server: {
		port: 5001,
	},
	build: {
		outDir: './dist',
		emptyOutDir: true,
		sourcemap: false,
		// Normal multi-file build: hashed chunks under dist/assets/ (cacheable forever).
		// The game scene is lazily imported (App.enterGame), and three.js gets its own
		// vendor chunk so game-code changes don't invalidate the cached three bundle.
		rolldownOptions: {
			output: {
				codeSplitting: {
					groups: [{ name: "three", test: /[\\/]node_modules[\\/]three[\\/]/ }],
				},
			},
		},
		// three.js alone is ~550 kB minified (~140 kB gzip); it's lazy, so don't warn.
		chunkSizeWarningLimit: 700,
	},
})
