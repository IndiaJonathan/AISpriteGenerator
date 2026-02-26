import { describe, expect, it } from 'vitest';
import { classifyVertexError } from './vertex-errors';

describe('classifyVertexError', () => {
  it('classifies resource exhausted as retryable transient error', () => {
    const error = new Error('{"error":{"code":429,"message":"Resource exhausted.","status":"RESOURCE_EXHAUSTED"}}') as Error & {
      status: number;
      code: string;
    };
    error.status = 429;
    error.code = 'RESOURCE_EXHAUSTED';

    const classified = classifyVertexError(error);

    expect(classified.code).toBe('VERTEX_TRANSIENT_ERROR');
    expect(classified.retryable).toBe(true);
  });

  it('classifies permission denied as permanent auth error', () => {
    const error = new Error('Permission denied while calling Vertex.') as Error & {
      status: number;
      code: string;
    };
    error.status = 403;
    error.code = 'PERMISSION_DENIED';

    const classified = classifyVertexError(error);

    expect(classified.code).toBe('VERTEX_PERMISSION_DENIED');
    expect(classified.retryable).toBe(false);
  });
});
