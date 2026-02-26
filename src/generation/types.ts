export type OutputFormat = 'png' | 'webp';

export type GenerateOptions = {
  prompt: string;
  count: number;
  width: number;
  height: number;
  transparent: boolean;
  formats: OutputFormat[];
  outputDir: string;
  prefix: string;
  seedStart: number;
  timeoutMs: number;
  retryMaxAttempts: number;
  retryInitialDelayMs: number;
};

export type GenerationOutput = {
  format: OutputFormat;
  path: string;
  bytes: number;
  sha256: string;
};

export type GenerationItemResult = {
  index: number;
  seed: number;
  status: 'done' | 'failed';
  attemptsMade: number;
  outputs: GenerationOutput[];
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
};

export type GenerateRunReport = {
  runId: string;
  provider: 'vertex';
  projectId: string;
  location: string;
  modelId: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  request: {
    prompt: string;
    count: number;
    width: number;
    height: number;
    transparent: boolean;
    formats: OutputFormat[];
    outputDir: string;
    prefix: string;
    seedStart: number;
    timeoutMs: number;
    retryMaxAttempts: number;
    retryInitialDelayMs: number;
  };
  items: GenerationItemResult[];
  summary: {
    total: number;
    done: number;
    failed: number;
  };
};

export type GenerationProgressEvent =
  | {
      type: 'run-start';
      runId: string;
      total: number;
      width: number;
      height: number;
      transparent: boolean;
    }
  | {
      type: 'item-start';
      runId: string;
      index: number;
      total: number;
      seed: number;
      attempt: number;
    }
  | {
      type: 'item-heartbeat';
      runId: string;
      index: number;
      total: number;
      seed: number;
      attempt: number;
      elapsedMs: number;
    }
  | {
      type: 'item-retry';
      runId: string;
      index: number;
      total: number;
      seed: number;
      attempt: number;
      delayMs: number;
      errorCode: string;
      errorMessage: string;
    }
  | {
      type: 'item-done';
      runId: string;
      index: number;
      total: number;
      seed: number;
      attempt: number;
      durationMs: number;
      outputCount: number;
    }
  | {
      type: 'item-failed';
      runId: string;
      index: number;
      total: number;
      seed: number;
      attempt: number;
      durationMs: number;
      errorCode: string;
      errorMessage: string;
      retryable: boolean;
    }
  | {
      type: 'run-complete';
      runId: string;
      total: number;
      done: number;
      failed: number;
      durationMs: number;
    };

export type ProgressReporter = (event: GenerationProgressEvent) => void;
