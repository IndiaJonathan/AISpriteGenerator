---
name: aispritegenerator-generate-images
description: Generate one or many images with `aispritegenerator-cli` (or `spritegen-agent`), monitor live progress, and return output file paths from the final JSON report.
---

# AISpriteGenerator Generate Images

## Purpose

Generate images locally via Vertex without running any API/worker/Redis/DB services.

## Core Workflow

### 1. Check CLI availability

```bash
aispritegenerator-cli --version
```

If missing:

```bash
npm install -g aispritegenerator-cli
```

### 2. Configure credentials and project

Use one of:
- saved profile (`auth login`)
- CLI flags (`--project-id`, `--credentials`, etc.)
- env vars (`VERTEX_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS`, etc.)

### 3. Run generation

```bash
aispritegenerator-cli generate \
  --prompt "<prompt>" \
  --count <n> \
  --width <w> \
  --height <h> \
  --formats png,webp \
  --output-dir <dir> \
  --prefix <name>
```

Add `--transparent` for transparent-background extraction.

### 4. Track progress + final result

- Progress events stream as JSON lines to `stderr` with `stream: "progress"`.
- Final report is JSON on `stdout`.
- Treat non-zero exit as failure.

Common progress types:
- `run-start`
- `item-start`
- `item-heartbeat`
- `item-retry`
- `item-done`
- `item-failed`
- `run-complete`

Split streams when needed:

```bash
aispritegenerator-cli generate ... 1>run-report.json 2>run-progress.log
```

Use final report fields:
- `summary.failed`
- `items[].outputs[].path`
- `items[].error`
