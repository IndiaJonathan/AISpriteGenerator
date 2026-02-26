# AISpriteGenerator CLI

Generate game-ready sprite images from prompts, directly from the command line.

No API server, worker, Redis, Postgres, or Mongo required.

## Who This Is For

- Game devs who want fast art iteration.
- Teams scripting image generation in CI or local tooling.
- AI agents that need a simple CLI contract.

## Who This Is Not For

- Teams looking for a hosted API service.
- Workflows that need a full backend + queue system.

## Install

```bash
npm install -g aispritegenerator-cli
```

## 60-Second Quickstart

1. Save your Vertex defaults once:

```bash
spritegen-agent auth login \
  --project-id your-gcp-project-id \
  --credentials /absolute/path/to/service-account.json \
  --location global \
  --model-id gemini-3-pro-image-preview
```

2. Generate one image:

```bash
spritegen-agent generate \
  --prompt "top-down pixel art copper ore icon" \
  --count 1 \
  --width 256 \
  --height 256 \
  --output-dir ./out \
  --prefix copper-ore
```

If this works, you are ready to batch generate.

## Common Workflows

Generate one icon:

```bash
spritegen-agent generate \
  --prompt "isometric iron ore game icon" \
  --count 1 \
  --width 128 \
  --height 128 \
  --output-dir ./out \
  --prefix iron-ore
```

Generate 20 variations:

```bash
spritegen-agent generate \
  --prompt "fantasy potion bottle icon, game UI style" \
  --count 20 \
  --seed-start 1000 \
  --output-dir ./out \
  --prefix potion
```

Generate transparent sprites:

```bash
spritegen-agent generate \
  --prompt "2d game tree stump, centered subject" \
  --count 8 \
  --transparent \
  --formats png,webp \
  --output-dir ./out \
  --prefix tree-stump
```

`--transparent` enables two-pass transparent-background extraction. Without it, generation is single-pass and opaque by default.

## What You See While It Runs

- Live progress is emitted as JSON lines on `stderr` (`stream: "progress"`).
- Final run result is emitted as JSON on `stdout`.
- Exit code is non-zero if any item failed.

Progress event types:
- `run-start`
- `item-start`
- `item-heartbeat`
- `item-retry`
- `item-done`
- `item-failed`
- `run-complete`

Split streams if you are automating:

```bash
spritegen-agent generate ... 1>run-report.json 2>run-progress.log
```

## Agent/Automation Notes

- Treat `stdout` JSON as source of truth.
- Check `summary.failed`; if `> 0`, treat the run as failed.
- Use `items[].outputs[].path` to collect generated files.
- Use `items[].error` for per-item diagnostics.

## Configuration

Environment variables:
- `SPRITEGEN_AGENT_PROFILE`
- `VERTEX_PROJECT_ID`
- `GOOGLE_APPLICATION_CREDENTIALS`
- `VERTEX_LOCATION` (default: `global`)
- `VERTEX_MODEL_ID` (default: `gemini-3-pro-image-preview`)

Resolution order:
- CLI flags
- Environment variables
- Saved profile (`auth login`)
- Built-in defaults (`global`, `gemini-3-pro-image-preview`)

## Common Failures

| Symptom | Likely cause | Fix |
|---|---|---|
| Missing project id error | `VERTEX_PROJECT_ID` not set and no saved profile | Pass `--project-id` or run `auth login` |
| Credentials path missing/unreadable | Invalid `GOOGLE_APPLICATION_CREDENTIALS` or missing `--credentials` | Point to a valid service account JSON file |
| Permission denied from Vertex | Service account lacks required IAM permissions | Update IAM roles on the project |
| Long retries / overload | Vertex transient capacity issues | Increase timeout/retry options and let backoff continue |

## Command Reference

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

## Publishing

```bash
npm login
npm run lint
npm test
npm run build
npm publish --access public
```

## License

MIT
