import sharp from 'sharp';

export async function applySourceAlphaMask(
  image: Buffer,
  sourceImage: Buffer,
  width: number,
  height: number
): Promise<Buffer> {
  const imageRaw = await sharp(image)
    .resize(width, height, {
      fit: 'contain',
      position: 'center',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const sourceRaw = await sharp(sourceImage)
    .resize(width, height, {
      fit: 'contain',
      position: 'center',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const output = Buffer.alloc(width * height * 4);

  for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
    const imageOffset = pixelIndex * imageRaw.info.channels;
    const sourceOffset = pixelIndex * sourceRaw.info.channels;
    const outputOffset = pixelIndex * 4;
    const alpha = sourceRaw.data[sourceOffset + 3] ?? 0;

    output[outputOffset] = alpha === 0 ? 0 : imageRaw.data[imageOffset] ?? 0;
    output[outputOffset + 1] = alpha === 0 ? 0 : imageRaw.data[imageOffset + 1] ?? 0;
    output[outputOffset + 2] = alpha === 0 ? 0 : imageRaw.data[imageOffset + 2] ?? 0;
    output[outputOffset + 3] = alpha;
  }

  return sharp(output, {
    raw: {
      width,
      height,
      channels: 4
    }
  })
    .png({
      compressionLevel: 9,
      palette: false
    })
    .toBuffer();
}
