import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { applySourceAlphaMask } from './alpha-mask';

describe('applySourceAlphaMask', () => {
  it('keeps generated color while replacing alpha with the source alpha matte', async () => {
    const generated = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 4,
        background: { r: 10, g: 20, b: 30, alpha: 1 }
      }
    })
      .png()
      .toBuffer();

    const source = await sharp(
      Buffer.from([
        0, 0, 0, 0,
        0, 0, 0, 255,
        0, 0, 0, 128,
        0, 0, 0, 64
      ]),
      {
        raw: {
          width: 2,
          height: 2,
          channels: 4
        }
      }
    )
      .png()
      .toBuffer();

    const output = await applySourceAlphaMask(generated, source, 2, 2);
    const { data } = await sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    expect(Array.from(data)).toEqual([
      0, 0, 0, 0,
      10, 20, 30, 255,
      10, 20, 30, 128,
      10, 20, 30, 64
    ]);
  });
});
