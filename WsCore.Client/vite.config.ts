import { defineConfig } from "vite"

export default defineConfig({
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
