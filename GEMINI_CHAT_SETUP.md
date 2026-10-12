# A.S.G.A.R.D. Setup

A.S.G.A.R.D. means Advanced Study Guide and Rapid Developer. It uses the Cloudflare Pages Worker so the Gemini API key stays on the server. Course names and uploaded files are stored in this browser's IndexedDB, not in the repository or Cloudflare storage. When you ask a question, the selected source files are sent through the Worker to Gemini. They are not retained by this site.

## Deploy on Cloudflare Pages

1. Create a Cloudflare Pages project connected to the repository containing this site.
2. Set the project root to the website folder containing `css/`, `html/`, `js/`, `_worker.js`, and `wrangler.toml`.
3. Use no build command and set the build output directory to `.`. Keep `_worker.js` in that output directory so Pages uses advanced mode.
4. Add a secret named `GEMINI_API_KEY` in the Pages project's Settings under Variables and Secrets. Create the key through Google AI Studio; do not put it in site JavaScript, HTML, or this file.
5. Optionally add `GEMINI_MODEL` as a regular variable. It defaults to `gemini-3.8-flash`.
6. Redeploy the project. Future pushes to `main` trigger new deployments. A.S.G.A.R.D. is available at `/` and `/html/study.html`.

The project needs a Gemini API key and an account with API access. API usage may incur charges. Before sharing the study area, configure Cloudflare Access for the site hostname, or at minimum protect `/`, `/html/study*`, and `/api/study*`. Set Cloudflare rate limits and restrictive Gemini API quotas too. The Worker's same-origin check is not authentication.

Do not upload sensitive documents or material you are not allowed to share with Gemini. Review your course rules and the provider's data terms before using assessment materials.

## Study Library

- Supported files: PDF, TXT, and Markdown.
- Maximum file size: 5 MB each; up to 12 files per course.
- Select up to 4 sources for a question. Selected PDFs must total 8 MB or less; text sources are limited to 250 KB each.
- Files remain in the current browser profile and are not synced. Clearing browser site data removes the library.
- The Worker processes a request but does not save uploaded files. Selected files are sent to Gemini each time you ask a question.

## Local Preview

Install Node.js, then run the following from this folder:

```sh
npx wrangler pages dev .
```

Set `GEMINI_API_KEY` as a local Wrangler secret or provide it through Wrangler's local development environment. Never commit a real key or a local secrets file. Open `http://localhost:8788/` to use A.S.G.A.R.D.

A.S.G.A.R.D. needs the Worker endpoint to answer questions. The portfolio Q&A endpoint remains available at `/api/chat` for the legacy portfolio pages.
