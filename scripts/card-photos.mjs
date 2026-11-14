/**
 * Build the photo-card images: duotone + resize + WebP, once, at build time.
 *
 *   1. Put the original photo in assets/card-photos/<slug>.jpg (or .jpeg/.png/.webp)
 *   2. In src/content/cards.ts give the card  image: 'images/cards/<slug>.webp'
 *   3. Run  npm run card-photos   → writes public/images/cards/<slug>.webp
 *
 * Duotone: shadows in the card's variant colour, highlights in --card (#F4F2EE).
 * Originals are not shipped; only the processed WebPs in public/ are.
 */
import { readFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, parse } from 'node:path';
import sharp from 'sharp';

const SRC = 'assets/card-photos';
const OUT = 'public/images/cards';
const LONG_SIDE = 800;

const HIGHLIGHT = [0xf4, 0xf2, 0xee]; // --card
const SHADOWS = {
  oxblood: [0x5f, 0x0f, 0x0c], // --oxblood-dark
  ocean: [0x09, 0x69, 0x96], // --ocean
  ink: [0x14, 0x15, 0x17], // --ink
  // light cards: ink with a very light ocean tint
  card: [0x14, 0x15, 0x17].map((c, i) => Math.round(c * 0.84 + [0x09, 0x69, 0x96][i] * 0.16)),
};

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
  const shadow = SHADOWS[variant] ?? SHADOWS.ink;
  // grey level g (0..255) → shadow + (highlight - shadow) * g/255, per channel
  const { data: grey, info } = await sharp(join(SRC, file))
    .rotate()
    .resize(LONG_SIDE, LONG_SIDE, { fit: 'inside', withoutEnlargement: true })
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
  await sharp(rgb, { raw: { width: info.width, height: info.height, channels: 3 } })
    .webp({ quality: 75 })
    .toFile(join(OUT, `${slug}.webp`));
  console.log(`✓ ${slug}.webp  (${variant})`);
}
