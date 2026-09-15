import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Multi-page configuration: each HTML file at the project root is an entrypoint.
//
// GitHub Pages hosts project sites at `https://<user>.github.io/<repo>/`,
// so built asset URLs need to be prefixed with the repo name. The CI
// workflow sets BASE_PATH to that value at build time. Local dev + user
// site (`<user>.github.io`) builds omit it and use the default `/`.
export default defineConfig({
    root: '.',
    publicDir: false,
    base: process.env.BASE_PATH || '/',
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                index: resolve(__dirname, 'index.html'),
                app: resolve(__dirname, 'app.html'),
                galleryDev: resolve(__dirname, 'gallery-dev.html'),
                galleryMy: resolve(__dirname, 'gallery-my.html'),
            },
        },
    },
    server: {
        open: '/index.html',
    },
});
