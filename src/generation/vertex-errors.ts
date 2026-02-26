const TRANSIENT_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const TRANSIENT_PROVIDER_CODES = new Set([
  'aborted',
  'deadline_exceeded',
  'resource_exhausted',
  'rate_limited',
  'service_unavailable',
  'temporarily_unavailable',
  'unavailable'
]);
const AUTH_PROVIDER_CODES = new Set(['permission_denied', 'permission-denied', 'unauthenticated', 'unauthorized']);
const TRANSIENT_GRPC_CODES = new Set([4, 8, 10, 14]);
const AUTH_GRPC_CODES = new Set([7, 16]);

export type VertexFailure = {
  code: string;
  message: string;
  retryable: boolean;
  status: number | null;
  providerCode: string | number | null;
};

export function classifyVertexError(error: unknown): VertexFailure {
  const parsed = parseVertexError(error);

  if (isAuthFailure(parsed.status, parsed.providerCodeNumber, parsed.providerCodeText, parsed.message)) {
    return {
      code: 'VERTEX_PERMISSION_DENIED',
      message: `Vertex permission denied: ${parsed.message}`,
      retryable: false,
      status: parsed.status,
      providerCode: parsed.providerCodeText ?? parsed.providerCodeNumber ?? null
    };
  }

  if (isTransientFailure(parsed.status, parsed.providerCodeNumber, parsed.providerCodeText)) {
    return {
      code: 'VERTEX_TRANSIENT_ERROR',
      message: `Vertex transient error: ${parsed.message}`,
      retryable: true,
      status: parsed.status,
      providerCode: parsed.providerCodeText ?? parsed.providerCodeNumber ?? null
    };
  }

  return {
    code: 'VERTEX_PERMANENT_ERROR',
    message: `Vertex permanent error: ${parsed.message}`,
    retryable: false,
    status: parsed.status,
    providerCode: parsed.providerCodeText ?? parsed.providerCodeNumber ?? null
  };
}

function parseVertexError(error: unknown): {
  status: number | null;
  providerCodeNumber: number | null;
  providerCodeText: string | null;
  message: string;
} {
  if (!error || typeof error !== 'object') {
    return {
      status: null,
      providerCodeNumber: null,
      providerCodeText: null,
      message: error instanceof Error ? error.message : String(error)
    };
  }

  const root = error as Record<string, unknown>;
  const rootResponse = readRecord(root['response']);
  const rootError = readRecord(root['error']);
  const errorInfo = readRecord(root['errorInfo']);
  const details = readRecord(root['details']);
  const responseError = readRecord(rootResponse?.['error']);

  let message =
    readString(root['message'], rootError?.['message'], responseError?.['message'], details?.['message'], root['statusText']) ??
    'Unknown Vertex API error.';

  if (message.trim().startsWith('{')) {
    const parsedJson = tryParseJson(message);
    const parsedError = readRecord(parsedJson?.['error']);
    const parsedMessage = readString(parsedError?.['message']);
    if (parsedMessage) {
      message = parsedMessage;
    }
  }

  const providerCode = readFirstDefined(
    root['code'],
    rootError?.['code'],
    responseError?.['code'],
    errorInfo?.['reason'],
    details?.['code']
  );

  return {
    status: readNumber(root['status'], rootResponse?.['status'], rootError?.['status'], responseError?.['status'], details?.['httpStatus']),
    providerCodeNumber: typeof providerCode === 'number' && Number.isFinite(providerCode) ? providerCode : null,
    providerCodeText: typeof providerCode === 'string' ? providerCode.trim().toLowerCase() : null,
    message
  };
}

function isAuthFailure(
  status: number | null,
  providerCodeNumber: number | null,
  providerCodeText: string | null,
  message: string
): boolean {
  const normalizedMessage = message.trim().toLowerCase();

  if (status === 401 || status === 403) {
    return true;
  }

  if (providerCodeNumber !== null && AUTH_GRPC_CODES.has(providerCodeNumber)) {
    return true;
  }

  if (providerCodeText && AUTH_PROVIDER_CODES.has(providerCodeText)) {
    return true;
  }

  return (
    normalizedMessage.includes('permission denied') ||
    normalizedMessage.includes('permission-denied') ||
    normalizedMessage.includes('unauthorized') ||
    normalizedMessage.includes('unauthenticated')
  );
}

function isTransientFailure(
  status: number | null,
  providerCodeNumber: number | null,
  providerCodeText: string | null
): boolean {
  if (status !== null && TRANSIENT_HTTP_STATUSES.has(status)) {
    return true;
  }

  if (providerCodeNumber !== null && TRANSIENT_GRPC_CODES.has(providerCodeNumber)) {
    return true;
  }

  return providerCodeText !== null && TRANSIENT_PROVIDER_CODES.has(providerCodeText);
}

function tryParseJson(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return readRecord(parsed);
  } catch {
    return null;
  }
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function readString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }

  return null;
}

function readFirstDefined(...values: unknown[]): unknown {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return value;
    }
  }

  return null;
}
