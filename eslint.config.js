import js from '@eslint/js';
import globals from 'globals';

export default [
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.browser,
            },
        },
        rules: {
            'no-unused-vars': [
                'warn',
                {
                    argsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                },
            ],
        },
    },
    // Node-scoped globals for build-time config files at the repo root.
    // vite.config.js reads `process.env.BASE_PATH` for the GitHub Pages
    // deploy, and eslint.config.js itself runs in Node too.
    {
        files: ['vite.config.js', 'eslint.config.js'],
        languageOptions: {
            globals: {
                ...globals.node,
            },
        },
    },
    {
        ignores: ['dist/**', 'node_modules/**'],
    },
];
