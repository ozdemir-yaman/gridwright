# Gridwright

Virtual graph paper with grid-snapped drawing tools. Sketch on an
infinite canvas, snap every stroke to a 50-unit grid, and export the
result as SVG, PNG, or JSON. A vanilla-JS + Vite project — no framework,
no build-time compilation of your own code, just modules.

**Live demo:** `https://ozdemir-yaman.github.io/gridwright/`

## Features

- **Grid-snapped drawing** — every stroke lands on one of the 8 axes
  (horizontal, vertical, or ±45° diagonal) radiating from a grid corner.
- **Selection tools** — rotate 90° CW/CCW, flip horizontally/vertically,
  deduplicate overlapping segments, cut/copy/paste, delete.
- **Undo/redo** — 10-snapshot ring buffer with `Ctrl+Z` / `Ctrl+Shift+Z`.
- **Autosave** — every 60 s to localStorage; restored on next visit.
- **Import/export** — SVG (with optional grid), PNG (up to 8000 px per
  side), or JSON (round-trips through the app).
- **My Gallery** — save drawings to a local-only gallery, back it up to
  disk and restore across browsers.
- **Developer's Gallery** — a folder of bundled example drawings that
  ships with the app.
- **Keyboard-first** — every tool and transform has a shortcut. Hold
  `Alt` to see them all as overlay badges.

## Getting started

### Prerequisites

- **Node.js 22+** (the CI workflow pins to 22 LTS; 20.19+ also works).
- **npm** — bundled with Node.

### Run it locally

```
git clone https://github.com/<your-user>/gridwright.git
cd gridwright
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173/index.html`).

### Build the production bundle

```
npm run build
npm run preview
```

`npm run preview` serves `dist/` on a local port so you can smoke-test
the actual production output before shipping it.

## Scripts

| Command                | What it does                                           |
| ---------------------- | ------------------------------------------------------ |
| `npm run dev`          | Start Vite in dev mode with HMR.                       |
| `npm run build`        | Build the production bundle into `dist/`.              |
| `npm run preview`      | Serve `dist/` locally to verify the built output.      |
| `npm run lint`         | Run ESLint over `src/**/*.js` and root JS.             |
| `npm run format`       | Apply Prettier to every JS/CSS/HTML/JSON file.         |
| `npm run format:check` | Report Prettier drift without writing anything.        |

## Deploying to GitHub Pages

This repo ships a workflow at `.github/workflows/deploy.yml` that
builds and publishes to GitHub Pages on every push to `main`.

One-time setup after you fork:

1. Push the repo to GitHub under any name you like.
2. Go to **Settings → Pages → Build and deployment** and set **Source**
   to **GitHub Actions**.
3. Push a commit to `main` (or use the "Run workflow" button in the
   Actions tab). Watch the run complete.
4. Your site is now live at `https://<your-user>.github.io/<repo-name>/`.

The workflow automatically sets Vite's `base` option to `/<repo-name>/`
so asset URLs resolve under the project subpath. If you deploy to a user
site (`<user>.github.io` with no subpath), remove the `BASE_PATH`
environment variable from the workflow.

### Deploy elsewhere

The output at `dist/` is a plain static site. Any host that serves
static files works:

- **Netlify / Vercel / Cloudflare Pages** — point their build at
  `npm run build`, output directory `dist`, no environment variables
  needed (they typically serve at the domain root, so the default
  `base: '/'` is correct).
- **Any HTTP server** — copy `dist/` to your web root.

## Project layout

```
gridwright/
├─ index.html            Landing page — cards linking to app + galleries.
├─ app.html              The drawing app.
├─ gallery-dev.html      Developer's gallery (bundled drawings).
├─ gallery-my.html       User's gallery (localStorage).
├─ src/                  All JS modules (see AGENTS.md for details).
│  └─ dev-drawings-data.json   Bundled example drawings for gallery-dev.
├─ tokens.css            Design tokens (colors, spacing, shadows).
├─ style.css             App-only styles.
├─ landing.css           Landing + gallery-page styles.
├─ app-modal.css         Shared modal + export-dialog styles.
├─ action-menu.css       Reusable dropdown-menu styles.
├─ vite.config.js        Multi-page Vite configuration.
├─ eslint.config.js      ESLint flat config.
├─ .prettierrc           Prettier options.
└─ .github/workflows/    GitHub Actions (Pages deployment).
```

## Contributing

Contributions are welcome. Fork the repo, create a branch, open a PR
against `main`. Please run `npm run lint` and `npm run format:check`
before pushing — CI will fail the deploy if either fails.

See **[AGENTS.md](AGENTS.md)** for a deep dive on the architecture,
module responsibilities, coordinate systems, and conventions. If you're
planning a non-trivial change or using an AI coding assistant, start
there.

## License

[MIT](LICENSE) — do whatever you want with it, just keep the notice.
