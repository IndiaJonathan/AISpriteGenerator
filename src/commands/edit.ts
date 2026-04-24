import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { resolveVertexContext, type CliServices } from '../config/runtime-context';
import { generateVertexBatch } from '../generation/vertex-generator';
import type { GenerateOptions, GenerateRunReport, InputImage, ProgressReporter } from '../generation/types';
import { CliUsageError } from '../utils/errors';
import { sha256Hex } from '../utils/hash';
import {
  optionalStringOption,
  parseCommandArgs,
  requireStringOption
} from '../utils/parse';
import {
  createInputImageReport,
  parseGenerateOptions,
  type CommandExecutionResult
} from './generate';

export async function runEditCommand(argv: string[], services: CliServices): Promise<CommandExecutionResult> {
  const { values, positionals } = parseCommandArgs(argv, {
    'input-image': { type: 'string' },
    prompt: { type: 'string' },
    count: { type: 'string' },
    width: { type: 'string' },
    height: { type: 'string' },
    transparent: { type: 'boolean' },
    formats: { type: 'string' },
    'output-dir': { type: 'string' },
    prefix: { type: 'string' },
    'seed-start': { type: 'string' },
    profile: { type: 'string' },
    'project-id': { type: 'string' },
    credentials: { type: 'string' },
    location: { type: 'string' },
    'model-id': { type: 'string' },
    'timeout-ms': { type: 'string' },
    'retry-max-attempts': { type: 'string' },
    'retry-initial-delay-ms': { type: 'string' }
  });

  if (positionals.length > 0) {
    throw new CliUsageError(`Unexpected positional arguments: ${positionals.join(', ')}`);
  }

  const { inputImagePath, generateOptions } = parseEditOptions(values);
  const inputImage = await loadInputImage(inputImagePath);
  const options: GenerateOptions = {
    ...generateOptions,
    inputImage
  };

  const runId = `run_${randomUUID()}`;
  const startedAt = Date.now();
  const startedIso = new Date(startedAt).toISOString();

  const vertexContext = await resolveVertexContext(services, {
    profile: optionalStringOption(values, 'profile'),
    projectId: optionalStringOption(values, 'project-id'),
    credentialsPath: optionalStringOption(values, 'credentials'),
    location: optionalStringOption(values, 'location'),
    modelId: optionalStringOption(values, 'model-id')
  });

  const items = await generateVertexBatch(vertexContext, options, runId, createStderrProgressReporter());
  const endedAt = Date.now();

  const done = items.filter((item) => item.status === 'done').length;
  const failed = items.length - done;

  const report: GenerateRunReport = {
    runId,
    provider: 'vertex',
    projectId: vertexContext.projectId,
    location: vertexContext.location,
    modelId: vertexContext.modelId,
    startedAt: startedIso,
    endedAt: new Date(endedAt).toISOString(),
    durationMs: endedAt - startedAt,
    request: {
      prompt: options.prompt,
      count: options.count,
      width: options.width,
      height: options.height,
      transparent: options.transparent,
      formats: options.formats,
      outputDir: path.resolve(options.outputDir),
      prefix: options.prefix,
      seedStart: options.seedStart,
      timeoutMs: options.timeoutMs,
      retryMaxAttempts: options.retryMaxAttempts,
      retryInitialDelayMs: options.retryInitialDelayMs,
      inputImage: createInputImageReport(options.inputImage)
    },
    items,
    summary: {
      total: items.length,
      done,
      failed
    }
  };

  console.log(JSON.stringify(report, null, 2));

  return {
    failedCount: report.summary.failed
  };
}

export function parseEditOptions(values: Record<string, string | boolean | undefined>): {
  inputImagePath: string;
  generateOptions: GenerateOptions;
} {
  return {
    inputImagePath: requireStringOption(values, 'input-image', '--input-image'),
    generateOptions: parseGenerateOptions(values)
  };
}

export async function loadInputImage(inputImagePath: string): Promise<InputImage> {
  const absolutePath = path.resolve(inputImagePath);
  let content: Buffer;

  try {
    content = await readFile(absolutePath);
  } catch {
    throw new CliUsageError(`--input-image does not exist or is not readable: "${absolutePath}".`);
  }

  let format: string | undefined;
  try {
    const metadata = await sharp(content, { failOnError: true }).metadata();
    format = metadata.format;
  } catch {
    throw new CliUsageError(`--input-image must be a readable PNG, JPEG, or WebP image: "${absolutePath}".`);
  }

  const mimeType = imageFormatToMimeType(format);
  if (!mimeType) {
    throw new CliUsageError(`--input-image only supports PNG, JPEG, and WebP images: "${absolutePath}".`);
  }

  return {
    path: absolutePath,
    mimeType,
    content,
    bytes: content.byteLength,
    sha256: sha256Hex(content)
  };
}

function imageFormatToMimeType(format: string | undefined): string | undefined {
  if (format === 'png') {
    return 'image/png';
  }

  if (format === 'jpeg' || format === 'jpg') {
    return 'image/jpeg';
  }

  if (format === 'webp') {
    return 'image/webp';
  }

  return undefined;
}

function createStderrProgressReporter(): ProgressReporter {
  return (event) => {
    const payload = {
      stream: 'progress',
      timestamp: new Date().toISOString(),
      ...event
    };

    process.stderr.write(`${JSON.stringify(payload)}\n`);
  };
}
