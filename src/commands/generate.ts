import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { resolveVertexContext, type CliServices } from '../config/runtime-context';
import { generateVertexBatch } from '../generation/vertex-generator';
import type { AlphaMode, GenerateOptions, GenerateRunReport, InputImageReport, OutputFormat, ProgressReporter } from '../generation/types';
import { CliUsageError } from '../utils/errors';
import {
  optionalStringOption,
  parseCommandArgs,
  parseCsv,
  parseNonNegativeInteger,
  parsePositiveInteger,
  requireStringOption
} from '../utils/parse';

const ALLOWED_OUTPUT_FORMATS = new Set<OutputFormat>(['png', 'webp']);

export type CommandExecutionResult = {
  failedCount: number;
};

export async function runGenerateCommand(argv: string[], services: CliServices): Promise<CommandExecutionResult> {
  const { values, positionals } = parseCommandArgs(argv, {
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
    'retry-initial-delay-ms': { type: 'string' },
    'alpha-mode': { type: 'string' }
  });

  if (positionals.length > 0) {
    throw new CliUsageError(`Unexpected positional arguments: ${positionals.join(', ')}`);
  }

  const options = parseGenerateOptions(values);
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
      inputImage: createInputImageReport(options.inputImage),
      alphaMode: options.alphaMode
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

export function parseGenerateOptions(values: Record<string, string | boolean | undefined>): GenerateOptions {
  const prompt = requireStringOption(values, 'prompt', '--prompt');
  const count = parsePositiveInteger(requireStringOption(values, 'count', '--count'), '--count');

  const widthRaw = optionalStringOption(values, 'width');
  const heightRaw = optionalStringOption(values, 'height');
  const transparent = values['transparent'] === true;
  const formatsRaw = optionalStringOption(values, 'formats');
  const outputDir = optionalStringOption(values, 'output-dir') ?? './spritegen-out';
  const prefix = optionalStringOption(values, 'prefix') ?? 'image';
  const seedStartRaw = optionalStringOption(values, 'seed-start');
  const timeoutRaw = optionalStringOption(values, 'timeout-ms');
  const retryAttemptsRaw = optionalStringOption(values, 'retry-max-attempts');
  const retryDelayRaw = optionalStringOption(values, 'retry-initial-delay-ms');
  const alphaModeRaw = optionalStringOption(values, 'alpha-mode');

  const width = widthRaw ? parsePositiveInteger(widthRaw, '--width') : 1024;
  const height = heightRaw ? parsePositiveInteger(heightRaw, '--height') : 1024;
  const seedStart = seedStartRaw ? parseNonNegativeInteger(seedStartRaw, '--seed-start') : 0;
  const timeoutMs = timeoutRaw ? parsePositiveInteger(timeoutRaw, '--timeout-ms') : 43_200_000;
  const retryMaxAttempts = retryAttemptsRaw ? parsePositiveInteger(retryAttemptsRaw, '--retry-max-attempts') : 10;
  const retryInitialDelayMs = retryDelayRaw ? parsePositiveInteger(retryDelayRaw, '--retry-initial-delay-ms') : 30_000;
  const alphaMode = parseAlphaMode(alphaModeRaw);

  const parsedFormats = parseCsv(formatsRaw ?? 'png') ?? ['png'];
  const formats: OutputFormat[] = [];

  for (const format of parsedFormats) {
    if (!ALLOWED_OUTPUT_FORMATS.has(format as OutputFormat)) {
      throw new CliUsageError('--formats only supports: png, webp.');
    }

    formats.push(format as OutputFormat);
  }

  const uniqueFormats = Array.from(new Set(formats));

  return {
    prompt,
    count,
    width,
    height,
    transparent,
    formats: uniqueFormats,
    outputDir,
    prefix,
    seedStart,
    timeoutMs,
    retryMaxAttempts,
    retryInitialDelayMs,
    alphaMode
  };
}

function parseAlphaMode(raw: string | undefined): AlphaMode {
  if (!raw) {
    return 'extract';
  }

  if (raw === 'edited' || raw === 'source' || raw === 'extract') {
    return raw;
  }

  throw new CliUsageError('--alpha-mode only supports: edited, source, extract.');
}

export function createInputImageReport(
  inputImage: GenerateOptions['inputImage']
): InputImageReport | undefined {
  if (!inputImage) {
    return undefined;
  }

  return {
    path: inputImage.path,
    mimeType: inputImage.mimeType,
    bytes: inputImage.bytes,
    sha256: inputImage.sha256
  };
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
