# Gemini Portfolio Chat Setup

The chat uses a Cloudflare Pages advanced-mode Worker so the Gemini API key stays on the server. The Worker reads the published HTML pages as its source material. The CV PDF is not indexed.

## Deploy on Cloudflare Pages

1. Create a Cloudflare Pages project connected to the repository containing this site.
2. Set the project root to the website folder containing `css/`, `html/`, `js/`, `_worker.js`, and `wrangler.toml`.
3. Use no build command and set the build output directory to `.`. Keep `_worker.js` in that output directory so Pages uses advanced mode.
4. Add a secret named `GEMINI_API_KEY` in the Pages project's Settings under Variables and Secrets. Create the key through Google AI Studio; do not put it in site JavaScript, HTML, or this file.
5. Optionally add `GEMINI_MODEL` as a regular variable. It defaults to `gemini-3.8-flash`.
6. Redeploy the project. Future pushes to `main` trigger new deployments. The home page is available at `/` and `/html/index.html`.

The project needs a Gemini API key and an account with API access. API usage may incur charges. Because the chat endpoint is public, set a restrictive Gemini API quota and configure Cloudflare rate limiting for `/api/chat` before sharing the site widely.

## Local Preview

Install Node.js, then run the following from this folder:

```sh
npx wrangler pages dev .
```

Set `GEMINI_API_KEY` as a local Wrangler secret or provide it through Wrangler's local development environment. Never commit a real key or a local secrets file.

The chat UI can load from a local static server, but it cannot generate answers unless the `/api/chat` Worker endpoint is running and has a valid key.
