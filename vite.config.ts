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
				chatBasic: resolve(import.meta.dirname, 'web/chat_basic/index.html'),
				chatPro: resolve(import.meta.dirname, 'web/chat_pro/index.html'),
				documentsStats: resolve(import.meta.dirname, 'web/documents_stats/index.html'),
			},
		},
	},
	server: {
		port: 5173,
	},
});
