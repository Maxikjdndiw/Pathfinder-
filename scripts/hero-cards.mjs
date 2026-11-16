/**
 * Photos for the hero card stack (src/components/card-swap.ts). Run: npm run hero-cards
 * Portrait crops (680 x 880, twice the 340 x 440 card) of the originals in assets/card-photos/,
 * with the brand duotone (scripts/lib/duotone.mjs). Only one card is oxblood, so the stack
 * never looks like a flag.
 */
import sharp from 'sharp';
import { duotone } from './lib/duotone.mjs';

const CARDS = {
  finance: 'oxblood',
  design: 'ocean',
  medizin: 'ink',
  auslandsjahr: 'card', // ink with a light ocean tint
};

for (const [slug, variant] of Object.entries(CARDS)) {
  const pipeline = sharp(`assets/card-photos/${slug}.jpg`)
    .rotate()
    .resize(680, 880, { fit: 'cover', position: sharp.strategy.attention });
  const info = await (await duotone(pipeline, variant)).webp({ quality: 78 }).toFile(`public/images/hero/${slug}.webp`);
  console.log(`hero ${slug}.webp ${variant} ${Math.round(info.size / 1024)} KB`);
}
