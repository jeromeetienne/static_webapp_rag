import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
	root: 'web',
	build: {
		outDir: '../dist',
		emptyOutDir: true,
		rollupOptions: {
			input: {
				index: resolve(import.meta.dirname, 'web/index.html'),
				query: resolve(import.meta.dirname, 'web/query/index.html'),
				chat: resolve(import.meta.dirname, 'web/chat/index.html'),
				stats: resolve(import.meta.dirname, 'web/stats/index.html'),
			},
		},
	},
	server: {
		port: 5173,
	},
});
