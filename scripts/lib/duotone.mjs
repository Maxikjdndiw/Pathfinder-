/**
 * Brand duotone, shared by the path cards (scripts/card-photos.mjs) and the network tiles
 * (scripts/network-images.mjs) so both look like one world.
 * Shadows in the variant colour, highlights in --card (#F4F2EE).
 */
import sharp from 'sharp';

export const HIGHLIGHT = [0xf4, 0xf2, 0xee]; // --card
export const SHADOWS = {
  oxblood: [0x5f, 0x0f, 0x0c], // --oxblood-dark
  ocean: [0x09, 0x69, 0x96], // --ocean
  ink: [0x14, 0x15, 0x17], // --ink
  // light cards: ink with a very light ocean tint
  card: [0x14, 0x15, 0x17].map((c, i) => Math.round(c * 0.84 + [0x09, 0x69, 0x96][i] * 0.16)),
};

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
