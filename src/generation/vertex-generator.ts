import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { GoogleGenAI, Modality, type Content, type GenerateContentResponse } from '@google/genai';
import type {
  GenerateOptions,
  GenerationItemResult,
  GenerationOutput,
  InputImage,
  OutputFormat,
  ProgressReporter
} from './types';
import type { ResolvedVertexContext } from '../config/runtime-context';
import { sha256Hex } from '../utils/hash';
import { applySourceAlphaMask } from './alpha-mask';
import { classifyVertexError } from './vertex-errors';

type ExtractedInlineImage = {
  candidateIndex: number;
  partIndex: number;
  mimeType: string;
  content: Buffer;
};

type VertexGenerateContentRequest = {
  model: string;
  contents: readonly Content[];
  config?: {
    responseModalities?: readonly Modality[];
  };
};

const VERTEX_WHITE_BACKGROUND_INSTRUCTION = [
  'For alpha extraction, render this intermediate image against a solid background instead of transparency.',
  'Generate the subject on a perfectly solid pure white (#FFFFFF) background ONLY.',
  'No gradients, shadows, borders, patterns, reflections, or extra shapes in the background.',
  'Keep the subject fully in frame.'
].join(' ');

const VERTEX_BLACK_BACKGROUND_EDIT_INSTRUCTION = [
  'Change ONLY the background to a perfectly solid pure black (#000000).',
  'Do not change the subject, lighting, camera angle, framing, or composition.',
  'Do not rescale or reposition anything.'
].join(' ');

const VERTEX_TRANSPARENT_SOURCE_EDIT_INSTRUCTION = [
  'Preserve the source image transparent-background asset format.',
  'Do not add a scene, floor, cast shadow, checkerboard, white fill, or any new background behind the subject.',
  'Keep the edited subject inside the original source silhouette unless the user explicitly asks for silhouette changes.'
].join(' ');

const EXTRACTED_ALPHA_FLOOR = 16 / 255;
const EXTRACTED_ALPHA_CEILING = 250 / 255;

export async function generateVertexBatch(
  context: ResolvedVertexContext,
  options: GenerateOptions,
  runId: string,
  progress?: ProgressReporter
): Promise<GenerationItemResult[]> {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = context.credentialsPath;

  progress?.({
    type: 'run-start',
    runId,
    total: options.count,
    width: options.width,
    height: options.height,
    transparent: options.transparent
  });

  const runStartedAt = Date.now();

  const ai = new GoogleGenAI({
    vertexai: true,
    project: context.projectId,
    location: normalizeLocation(context.location),
    apiVersion: 'v1'
  });

  const modelsClient = ai.models as {
    generateContent(request: VertexGenerateContentRequest): Promise<GenerateContentResponse>;
  };

  const runDirectory = path.resolve(options.outputDir, runId);
  await mkdir(runDirectory, { recursive: true });

  const items: GenerationItemResult[] = [];
  const runDeadline = Date.now() + options.timeoutMs;

  for (let index = 0; index < options.count; index += 1) {
    const seed = options.seedStart + index;
    const prompt = buildPrompt(options.prompt, options.width, options.height, seed);

    const result = await generateVertexItemWithRetry({
      modelsClient,
      context,
      options,
      runDirectory,
      index,
      seed,
      prompt,
      runDeadline,
      runId,
      totalCount: options.count,
      progress
    });

    items.push(result);
  }

  const done = items.filter((item) => item.status === 'done').length;
  const failed = items.length - done;

  progress?.({
    type: 'run-complete',
    runId,
    total: options.count,
    done,
    failed,
    durationMs: Math.max(0, Date.now() - runStartedAt)
  });

  return items;
}

async function generateVertexItemWithRetry(input: {
  modelsClient: {
    generateContent(request: VertexGenerateContentRequest): Promise<GenerateContentResponse>;
  };
  context: ResolvedVertexContext;
  options: GenerateOptions;
  runDirectory: string;
  index: number;
  seed: number;
  prompt: string;
  runDeadline: number;
  runId: string;
  totalCount: number;
  progress?: ProgressReporter;
}): Promise<GenerationItemResult> {
  let attemptsMade = 0;

  while (attemptsMade < input.options.retryMaxAttempts && Date.now() < input.runDeadline) {
    attemptsMade += 1;
    const attemptStartedAt = Date.now();

    input.progress?.({
      type: 'item-start',
      runId: input.runId,
      index: input.index,
      total: input.totalCount,
      seed: input.seed,
      attempt: attemptsMade
    });

    const stopHeartbeat = startAttemptHeartbeat({
      runId: input.runId,
      index: input.index,
      totalCount: input.totalCount,
      seed: input.seed,
      attempt: attemptsMade,
      startedAt: attemptStartedAt,
      progress: input.progress
    });

    try {
      const remainingMs = input.runDeadline - Date.now();
      if (remainingMs <= 0) {
        stopHeartbeat();
        break;
      }

      const generated = await generateItemImageBuffer({
        modelsClient: input.modelsClient,
        modelId: input.context.modelId,
        prompt: input.prompt,
        inputImage: input.options.inputImage,
        transparent: input.options.transparent,
        alphaMode: input.options.alphaMode,
        runDeadline: input.runDeadline
      });
      let normalized = await normalizeCanvas(generated, input.options.width, input.options.height, input.options.transparent);
      if (input.options.transparent && input.options.inputImage && input.options.alphaMode === 'source') {
        normalized = await applySourceAlphaMask(
          normalized,
          input.options.inputImage.content,
          input.options.width,
          input.options.height
        );
      }

      const outputs = await writeOutputs(input.runDirectory, {
        prefix: input.options.prefix,
        index: input.index,
        seed: input.seed,
        formats: input.options.formats,
        image: normalized
      });

      stopHeartbeat();
      input.progress?.({
        type: 'item-done',
        runId: input.runId,
        index: input.index,
        total: input.totalCount,
        seed: input.seed,
        attempt: attemptsMade,
        durationMs: Math.max(0, Date.now() - attemptStartedAt),
        outputCount: outputs.length
      });

      return {
        index: input.index,
        seed: input.seed,
        status: 'done',
        attemptsMade,
        outputs
      };
    } catch (error) {
      stopHeartbeat();
      const classified = classifyGenerationError(error);

      if (!classified.retryable || attemptsMade >= input.options.retryMaxAttempts) {
        input.progress?.({
          type: 'item-failed',
          runId: input.runId,
          index: input.index,
          total: input.totalCount,
          seed: input.seed,
          attempt: attemptsMade,
          durationMs: Math.max(0, Date.now() - attemptStartedAt),
          errorCode: classified.code,
          errorMessage: classified.message,
          retryable: classified.retryable
        });

        return {
          index: input.index,
          seed: input.seed,
          status: 'failed',
          attemptsMade,
          outputs: [],
          error: {
            code: classified.code,
            message: classified.message,
            retryable: classified.retryable
          }
        };
      }

      const delayMs = computeBackoffDelayMs(attemptsMade, input.options.retryInitialDelayMs);
      if (Date.now() + delayMs >= input.runDeadline) {
        input.progress?.({
          type: 'item-failed',
          runId: input.runId,
          index: input.index,
          total: input.totalCount,
          seed: input.seed,
          attempt: attemptsMade,
          durationMs: Math.max(0, Date.now() - attemptStartedAt),
          errorCode: classified.code,
          errorMessage: `${classified.message} (retry deadline exceeded)`,
          retryable: classified.retryable
        });

        return {
          index: input.index,
          seed: input.seed,
          status: 'failed',
          attemptsMade,
          outputs: [],
          error: {
            code: classified.code,
            message: `${classified.message} (retry deadline exceeded)`,
            retryable: classified.retryable
          }
        };
      }

      input.progress?.({
        type: 'item-retry',
        runId: input.runId,
        index: input.index,
        total: input.totalCount,
        seed: input.seed,
        attempt: attemptsMade,
        delayMs,
        errorCode: classified.code,
        errorMessage: classified.message
      });

      await sleep(delayMs);
    }
  }

  input.progress?.({
    type: 'item-failed',
    runId: input.runId,
    index: input.index,
    total: input.totalCount,
    seed: input.seed,
    attempt: attemptsMade,
    durationMs: 0,
    errorCode: 'VERTEX_RETRY_TIMEOUT',
    errorMessage: 'Retry window expired before generation completed.',
    retryable: true
  });

  return {
    index: input.index,
    seed: input.seed,
    status: 'failed',
    attemptsMade,
    outputs: [],
    error: {
      code: 'VERTEX_RETRY_TIMEOUT',
      message: 'Retry window expired before generation completed.',
      retryable: true
    }
  };
}

function startAttemptHeartbeat(input: {
  runId: string;
  index: number;
  totalCount: number;
  seed: number;
  attempt: number;
  startedAt: number;
  progress?: ProgressReporter;
}): () => void {
  if (!input.progress) {
    return () => undefined;
  }

  const timer = setInterval(() => {
    input.progress?.({
      type: 'item-heartbeat',
      runId: input.runId,
      index: input.index,
      total: input.totalCount,
      seed: input.seed,
      attempt: input.attempt,
      elapsedMs: Math.max(0, Date.now() - input.startedAt)
    });
  }, 15_000);

  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  return () => {
    clearInterval(timer);
  };
}

async function generateItemImageBuffer(input: {
  modelsClient: {
    generateContent(request: VertexGenerateContentRequest): Promise<GenerateContentResponse>;
  };
  modelId: string;
  prompt: string;
  inputImage?: InputImage;
  transparent: boolean;
  alphaMode: GenerateOptions['alphaMode'];
  runDeadline: number;
}): Promise<Buffer> {
  const firstRequestDeadline = input.runDeadline - Date.now();
  if (firstRequestDeadline <= 0) {
    throw new GenerationError('VERTEX_RETRY_TIMEOUT', 'Retry window expired before generation completed.', true);
  }

  if (!input.transparent) {
    const request = input.inputImage
      ? buildEditRequest(input.modelId, input.prompt, input.inputImage)
      : buildStandardRequest(input.modelId, input.prompt);
    const directResponse = await withTimeout(
      input.modelsClient.generateContent(request),
      firstRequestDeadline
    );
    const directImage = requireInlineImage(directResponse, input.inputImage ? 'image edit' : 'standard generation');
    return directImage.content;
  }

  if (input.inputImage && (input.alphaMode === 'edited' || input.alphaMode === 'source')) {
    const directResponse = await withTimeout(
      input.modelsClient.generateContent(
        buildEditRequest(
          input.modelId,
          `${input.prompt}\n\n${VERTEX_TRANSPARENT_SOURCE_EDIT_INSTRUCTION}`,
          input.inputImage
        )
      ),
      firstRequestDeadline
    );
    const directImage = requireInlineImage(directResponse, 'transparent source-image edit');
    return directImage.content;
  }

  const whiteRequest = input.inputImage
    ? buildEditWhiteBackgroundRequest(input.modelId, input.prompt, input.inputImage)
    : buildWhiteBackgroundRequest(input.modelId, input.prompt);
  const whiteResponse = await withTimeout(
    input.modelsClient.generateContent(whiteRequest),
    firstRequestDeadline
  );
  const whiteVariant = requireInlineImage(
    whiteResponse,
    input.inputImage ? 'white-background image edit' : 'white-background generation'
  );

  const secondRequestDeadline = Math.max(1, input.runDeadline - Date.now());
  const blackResponse = await withTimeout(
    input.modelsClient.generateContent(buildBlackBackgroundEditRequest(input.modelId, whiteVariant)),
    secondRequestDeadline
  );
  const blackVariant = requireInlineImage(blackResponse, 'black-background edit');

  return buildTransparentFromVariants(whiteVariant.content, blackVariant.content);
}

async function writeOutputs(
  runDirectory: string,
  input: {
    prefix: string;
    index: number;
    seed: number;
    formats: OutputFormat[];
    image: Buffer;
  }
): Promise<GenerationOutput[]> {
  const outputs: GenerationOutput[] = [];

  for (const format of input.formats) {
    const encoded = await encodeOutput(input.image, format);
    const filename = `${sanitizeFileName(input.prefix)}-${String(input.index).padStart(4, '0')}-seed-${input.seed}.${format}`;
    const absolutePath = path.resolve(runDirectory, filename);
    await writeFile(absolutePath, encoded);

    outputs.push({
      format,
      path: absolutePath,
      bytes: encoded.byteLength,
      sha256: sha256Hex(encoded)
    });
  }

  return outputs;
}

function buildPrompt(basePrompt: string, width: number, height: number, seed: number): string {
  return [
    basePrompt,
    `Output resolution target: ${width}x${height}.`,
    `Deterministic variant seed: ${seed}.`
  ].join('\n\n');
}

function buildStandardRequest(modelId: string, prompt: string): VertexGenerateContentRequest {
  return {
    model: modelId,
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }]
      }
    ],
    config: {
      responseModalities: [Modality.IMAGE]
    }
  };
}

function buildEditRequest(modelId: string, prompt: string, inputImage: InputImage): VertexGenerateContentRequest {
  return {
    model: modelId,
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: inputImage.mimeType,
              data: inputImage.content.toString('base64')
            }
          },
          {
            text: prompt
          }
        ]
      }
    ],
    config: {
      responseModalities: [Modality.IMAGE]
    }
  };
}

function buildWhiteBackgroundRequest(modelId: string, prompt: string): VertexGenerateContentRequest {
  return {
    model: modelId,
    contents: [
      {
        role: 'user',
        parts: [{ text: `${prompt}\n\n${VERTEX_WHITE_BACKGROUND_INSTRUCTION}` }]
      }
    ],
    config: {
      responseModalities: [Modality.IMAGE]
    }
  };
}

function buildEditWhiteBackgroundRequest(
  modelId: string,
  prompt: string,
  inputImage: InputImage
): VertexGenerateContentRequest {
  return buildEditRequest(modelId, `${prompt}\n\n${VERTEX_WHITE_BACKGROUND_INSTRUCTION}`, inputImage);
}

function buildBlackBackgroundEditRequest(modelId: string, whiteVariant: ExtractedInlineImage): VertexGenerateContentRequest {
  return {
    model: modelId,
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: whiteVariant.mimeType,
              data: whiteVariant.content.toString('base64')
            }
          },
          {
            text: VERTEX_BLACK_BACKGROUND_EDIT_INSTRUCTION
          }
        ]
      }
    ],
    config: {
      responseModalities: [Modality.IMAGE]
    }
  };
}

function requireInlineImage(response: GenerateContentResponse, stage: string): ExtractedInlineImage {
  const image = extractInlineImage(response);
  if (image) {
    return image;
  }

  const blockReason = response.promptFeedback?.blockReason;
  if (typeof blockReason === 'string' && blockReason === 'SAFETY') {
    throw new GenerationError('VERTEX_SAFETY_BLOCKED', `Vertex response was safety-blocked during ${stage}.`, false);
  }

  throw new GenerationError(
    'VERTEX_RESPONSE_MISSING_IMAGE',
    `Vertex response did not include an inline image payload during ${stage}.`,
    false
  );
}

function extractInlineImage(response: GenerateContentResponse): ExtractedInlineImage | null {
  for (const [candidateIndex, candidate] of (response.candidates ?? []).entries()) {
    const parts = candidate.content?.parts;
    if (!Array.isArray(parts)) {
      continue;
    }

    for (const [partIndex, part] of parts.entries()) {
      if (!isInlineImagePart(part)) {
        continue;
      }

      const content = decodeInlineData(part.inlineData.data);
      if (!content || content.byteLength === 0) {
        continue;
      }

      return {
        candidateIndex,
        partIndex,
        mimeType: part.inlineData.mimeType.toLowerCase(),
        content
      };
    }
  }

  return null;
}

function isInlineImagePart(
  part: unknown
): part is { inlineData: { mimeType: string; data: string | Uint8Array | ArrayBuffer } } {
  if (!part || typeof part !== 'object' || Array.isArray(part)) {
    return false;
  }

  const value = part as Record<string, unknown>;
  const inlineData = value['inlineData'];
  if (!inlineData || typeof inlineData !== 'object' || Array.isArray(inlineData)) {
    return false;
  }

  const record = inlineData as Record<string, unknown>;
  const mimeType = record['mimeType'];
  const data = record['data'];

  return (
    typeof mimeType === 'string' &&
    mimeType.toLowerCase().startsWith('image/') &&
    (typeof data === 'string' || data instanceof Uint8Array || data instanceof ArrayBuffer)
  );
}

function decodeInlineData(data: string | Uint8Array | ArrayBuffer): Buffer | null {
  if (typeof data === 'string') {
    if (data.startsWith('data:image/')) {
      const [, encoded] = data.split(',', 2);
      return encoded ? Buffer.from(encoded, 'base64') : null;
    }

    return Buffer.from(data, 'base64');
  }

  if (data instanceof Uint8Array) {
    return Buffer.from(data);
  }

  return Buffer.from(data);
}

async function buildTransparentFromVariants(whiteImage: Buffer, blackImage: Buffer): Promise<Buffer> {
  const whiteRaw = await sharp(whiteImage).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const blackRaw = await sharp(blackImage).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  const { data: whiteData, info: whiteInfo } = whiteRaw;
  const { data: blackData, info: blackInfo } = blackRaw;

  if (whiteInfo.width !== blackInfo.width || whiteInfo.height !== blackInfo.height) {
    throw new GenerationError('VERTEX_TRANSPARENCY_COMPOSITE_FAILED', 'White and black variant dimensions differ.', false);
  }

  if (whiteInfo.channels < 3 || blackInfo.channels < 3) {
    throw new GenerationError('VERTEX_TRANSPARENCY_COMPOSITE_FAILED', 'Expected RGB or RGBA image data from Vertex.', false);
  }

  const pixelCount = whiteInfo.width * whiteInfo.height;
  const output = Buffer.alloc(pixelCount * 4);

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    const whiteOffset = pixelIndex * whiteInfo.channels;
    const blackOffset = pixelIndex * blackInfo.channels;

    const rWhite = (whiteData[whiteOffset] ?? 0) / 255;
    const gWhite = (whiteData[whiteOffset + 1] ?? 0) / 255;
    const bWhite = (whiteData[whiteOffset + 2] ?? 0) / 255;

    const rBlack = (blackData[blackOffset] ?? 0) / 255;
    const gBlack = (blackData[blackOffset + 1] ?? 0) / 255;
    const bBlack = (blackData[blackOffset + 2] ?? 0) / 255;

    const alphaRed = 1 - (rWhite - rBlack);
    const alphaGreen = 1 - (gWhite - gBlack);
    const alphaBlue = 1 - (bWhite - bBlack);
    let alpha = (alphaRed + alphaGreen + alphaBlue) / 3;

    if (!Number.isFinite(alpha)) {
      alpha = 0;
    }

    alpha = Math.max(0, Math.min(1, alpha));
    if (alpha < EXTRACTED_ALPHA_FLOOR) {
      alpha = 0;
    } else if (alpha > EXTRACTED_ALPHA_CEILING) {
      alpha = 1;
    }

    let outputRed = 0;
    let outputGreen = 0;
    let outputBlue = 0;

    if (alpha > 1e-3) {
      outputRed = Math.max(0, Math.min(1, rBlack / alpha));
      outputGreen = Math.max(0, Math.min(1, gBlack / alpha));
      outputBlue = Math.max(0, Math.min(1, bBlack / alpha));
    }

    const outputOffset = pixelIndex * 4;
    output[outputOffset] = Math.round(outputRed * 255);
    output[outputOffset + 1] = Math.round(outputGreen * 255);
    output[outputOffset + 2] = Math.round(outputBlue * 255);
    output[outputOffset + 3] = Math.round(alpha * 255);
  }

  return sharp(output, {
    raw: {
      width: whiteInfo.width,
      height: whiteInfo.height,
      channels: 4
    }
  })
    .png({
      compressionLevel: 9,
      palette: false
    })
    .toBuffer();
}

async function normalizeCanvas(image: Buffer, width: number, height: number, transparentBackground: boolean): Promise<Buffer> {
  const background = transparentBackground
    ? {
        r: 0,
        g: 0,
        b: 0,
        alpha: 0
      }
    : {
        r: 255,
        g: 255,
        b: 255,
        alpha: 255
      };

  let pipeline = sharp(image).resize(width, height, {
    fit: 'contain',
    position: 'center',
    background
  });

  if (transparentBackground) {
    pipeline = pipeline.ensureAlpha();
  } else {
    pipeline = pipeline.flatten({ background: { r: 255, g: 255, b: 255 } });
  }

  return pipeline
    .png({
      compressionLevel: 9,
      palette: false
    })
    .toBuffer();
}

async function encodeOutput(sourceImage: Buffer, format: OutputFormat): Promise<Buffer> {
  if (format === 'webp') {
    return sharp(sourceImage, { failOnError: true })
      .webp({
        lossless: true,
        effort: 6,
        quality: 100,
        alphaQuality: 100
      })
      .toBuffer();
  }

  return sharp(sourceImage, { failOnError: true })
    .png({
      compressionLevel: 9,
      palette: false
    })
    .toBuffer();
}

function classifyGenerationError(error: unknown): {
  code: string;
  message: string;
  retryable: boolean;
} {
  if (error instanceof GenerationError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable
    };
  }

  if (error instanceof Error && error.message.startsWith('Vertex request timed out after')) {
    return {
      code: 'VERTEX_TRANSIENT_ERROR',
      message: error.message,
      retryable: true
    };
  }

  return classifyVertexError(error);
}

function computeBackoffDelayMs(attemptNumber: number, initialDelayMs: number): number {
  const exponent = Math.max(0, attemptNumber - 1);
  const baseDelay = initialDelayMs * Math.pow(2, exponent);
  const cappedBaseDelay = Math.min(baseDelay, 15 * 60 * 1000);
  const jitterFactor = 0.9 + Math.random() * 0.2;
  return Math.max(1000, Math.floor(cappedBaseDelay * jitterFactor));
}

function normalizeLocation(location: string): string {
  return location === 'us-central1' ? 'global' : location;
}

function sanitizeFileName(raw: string): string {
  const sanitized = raw.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return sanitized || 'image';
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`Vertex request timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

async function sleep(durationMs: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

class GenerationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean
  ) {
    super(message);
    this.name = 'GenerationError';
  }
}
