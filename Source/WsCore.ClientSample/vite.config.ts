import { defineConfig } from "vite"
import { viteSingleFile } from "vite-plugin-singlefile"

export default defineConfig({
	plugins: [viteSingleFile()],
	root: "./src",
	base: "./",
	build: {
		outDir: '../dist',
		sourcemap: false,
	},
})