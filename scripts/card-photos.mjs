/**
 * Build the photo-card images: duotone + resize + WebP, once, at build time.
 *
 *   1. Put the original photo in assets/card-photos/<slug>.jpg (or .jpeg/.png/.webp)
 *   2. In src/content/cards.ts give the card  image: 'images/cards/<slug>.webp'
 *   3. Run  npm run card-photos   → writes public/images/cards/<slug>.webp
 *
 * Duotone (scripts/lib/duotone.mjs): shadows in the card's variant colour, highlights in --card (#F4F2EE).
 * Originals are not shipped; only the processed WebPs in public/ are.
 */
import { readFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, parse } from 'node:path';
import sharp from 'sharp';
import { duotone } from './lib/duotone.mjs';

const SRC = 'assets/card-photos';
const OUT = 'public/images/cards';
const LONG_SIDE = 800;

// slug → variant, read from the card data so there is only one place to edit
const data = readFileSync('src/content/cards.ts', 'utf8');
const variants = new Map();
for (const line of data.split('\n')) {
  const img = line.match(/image:\s*'images\/cards\/([\w-]+)\.webp'/);
  const variant = line.match(/variant:\s*'(\w+)'/);
  if (img && variant) variants.set(img[1], variant[1]);
}

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
const files = existsSync(SRC) ? readdirSync(SRC).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)) : [];
if (!files.length) console.log(`No photos in ${SRC}/ yet.`);

for (const file of files) {
  const slug = parse(file).name;
  const variant = variants.get(slug);
  if (!variant) {
    console.warn(`skip ${file}: no card with image 'images/cards/${slug}.webp' in src/content/cards.ts`);
    continue;
  }
  const pipeline = sharp(join(SRC, file))
    .rotate()
    .resize(LONG_SIDE, LONG_SIDE, { fit: 'inside', withoutEnlargement: true });
  await (await duotone(pipeline, variant)).webp({ quality: 75 }).toFile(join(OUT, `${slug}.webp`));
  console.log(`ok ${slug}.webp (${variant})`);
}
