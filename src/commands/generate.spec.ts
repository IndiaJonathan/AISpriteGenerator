import { describe, expect, it } from 'vitest';
import { CliUsageError } from '../utils/errors';
import { parseGenerateOptions } from './generate';

describe('parseGenerateOptions', () => {
  it('parses required fields and applies defaults', () => {
    const options = parseGenerateOptions({
      prompt: 'a tiny robot icon',
      count: '2'
    });

    expect(options).toEqual({
      prompt: 'a tiny robot icon',
      count: 2,
      width: 1024,
      height: 1024,
      transparent: false,
      formats: ['png'],
      outputDir: './spritegen-out',
      prefix: 'image',
      seedStart: 0,
      timeoutMs: 43_200_000,
      retryMaxAttempts: 10,
      retryInitialDelayMs: 30_000
    });
  });

  it('supports explicit formats and numeric overrides', () => {
    const options = parseGenerateOptions({
      prompt: 'a crystal shard',
      count: '3',
      width: '512',
      height: '256',
      formats: 'png,webp,png',
      transparent: true,
      'seed-start': '7',
      'timeout-ms': '600000',
      'retry-max-attempts': '12',
      'retry-initial-delay-ms': '4000'
    });

    expect(options.formats).toEqual(['png', 'webp']);
    expect(options.width).toBe(512);
    expect(options.height).toBe(256);
    expect(options.transparent).toBe(true);
    expect(options.seedStart).toBe(7);
    expect(options.timeoutMs).toBe(600000);
    expect(options.retryMaxAttempts).toBe(12);
    expect(options.retryInitialDelayMs).toBe(4000);
  });

  it('rejects unsupported output formats', () => {
    expect(() =>
      parseGenerateOptions({
        prompt: 'a crystal shard',
        count: '1',
        formats: 'png,wav'
      })
    ).toThrow(CliUsageError);
  });
});
