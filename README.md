# AISpriteGenerator CLI

Standalone CLI for direct image generation with Google Vertex AI + Gemini image models.

No API server, worker, Redis, Postgres, or Mongo services are required.

## Install

```bash
npm install -g aispritegenerator-cli
```

## Quick Start

Save profile defaults once:

```bash
spritegen-agent auth login \
  --project-id your-gcp-project-id \
  --credentials /absolute/path/to/service-account.json \
  --location global \
  --model-id gemini-3-pro-image-preview
```

Generate a batch:

```bash
spritegen-agent generate \
  --prompt "isometric iron ore game icon" \
  --count 3 \
  --width 128 \
  --height 128 \
  --formats png,webp \
  --output-dir ./out \
  --prefix iron-ore
```

Use `--transparent` to enable two-pass transparent-background extraction. Without this flag, generation uses a single-pass render (opaque output).

## Output Contract

- Final run report is JSON on `stdout`.
- Progress events are JSON lines on `stderr` with `stream: "progress"`.
- Exit code is non-zero if any item failed.

Progress event types:
- `run-start`
- `item-start`
- `item-heartbeat`
- `item-retry`
- `item-done`
- `item-failed`
- `run-complete`

Example stream split:

```bash
spritegen-agent generate ... 1>run-report.json 2>run-progress.log
```

## Configuration

Environment variables:
- `SPRITEGEN_AGENT_PROFILE`
- `VERTEX_PROJECT_ID`
- `GOOGLE_APPLICATION_CREDENTIALS`
- `VERTEX_LOCATION` (default: `global`)
- `VERTEX_MODEL_ID` (default: `gemini-3-pro-image-preview`)

Defaults:
- Location: `global`
- Model: `gemini-3-pro-image-preview`
- Credentials path: no hardcoded machine default; provide via `--credentials`, `GOOGLE_APPLICATION_CREDENTIALS`, or `auth login`.

## Commands

```bash
spritegen-agent --help
spritegen-agent --version
spritegen-agent auth status
spritegen-agent auth logout
```

## Development

```bash
npm install
npm run lint
npm test
npm run build
```

## Publish

```bash
npm login
npm run lint
npm test
npm run build
npm publish --access public
```

## License

MIT
