import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { CliUsageError } from '../utils/errors';
import { loadInputImage, parseEditOptions } from './edit';

describe('parseEditOptions', () => {
  it('requires an input image and reuses generation defaults', () => {
    const parsed = parseEditOptions({
      'input-image': './source.png',
      prompt: 'make a beach skin',
      count: '2'
    });

    expect(parsed.inputImagePath).toBe('./source.png');
    expect(parsed.generateOptions).toEqual({
      prompt: 'make a beach skin',
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
      retryInitialDelayMs: 30_000,
      alphaMode: 'extract'
    });
  });

  it('rejects missing input image', () => {
    expect(() =>
      parseEditOptions({
        prompt: 'make a beach skin',
        count: '1'
      })
    ).toThrow(CliUsageError);
  });
});

describe('loadInputImage', () => {
  it('loads image metadata for supported source images', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'aisprite-edit-'));
    const file = path.join(dir, 'source.png');

    try {
      const png = await sharp({
        create: {
          width: 2,
          height: 2,
          channels: 4,
          background: { r: 255, g: 0, b: 0, alpha: 1 }
        }
      })
        .png()
        .toBuffer();

      await writeFile(file, png);

      const image = await loadInputImage(file);

      expect(image.path).toBe(file);
      expect(image.mimeType).toBe('image/png');
      expect(image.bytes).toBe(png.byteLength);
      expect(image.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(image.content.equals(png)).toBe(true);
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });
});
