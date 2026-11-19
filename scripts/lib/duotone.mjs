/**
 * Photo tone, shared by the hero cards (scripts/hero-cards.mjs) and the network tiles
 * (scripts/network-images.mjs) so both look like one world.
 * Neutral black and white: shadows in --ink, highlights white.
 */
import sharp from 'sharp';

export const HIGHLIGHT = [0xff, 0xff, 0xff];
const INK = [0x1d, 0x1d, 0x1f]; // --ink
// neutral black and white for every photo; the variant names stay for the callers
export const SHADOWS = { oxblood: INK, ocean: INK, ink: INK, card: INK };

/** Duotone a sharp pipeline (already resized/cropped) and return raw RGB + size */
export async function duotone(pipeline, variant) {
  const shadow = SHADOWS[variant] ?? SHADOWS.ink;
  const { data: grey, info } = await pipeline
    .greyscale()
    .normalise({ lower: 2, upper: 98 }) // use the full tonal range so the duotone has depth
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgb = Buffer.alloc(info.width * info.height * 3);
  for (let i = 0, j = 0; i < grey.length; i += info.channels, j += 3) {
    const t = grey[i] / 255;
    rgb[j] = shadow[0] + (HIGHLIGHT[0] - shadow[0]) * t;
    rgb[j + 1] = shadow[1] + (HIGHLIGHT[1] - shadow[1]) * t;
    rgb[j + 2] = shadow[2] + (HIGHLIGHT[2] - shadow[2]) * t;
  }
  return sharp(rgb, { raw: { width: info.width, height: info.height, channels: 3 } });
}
