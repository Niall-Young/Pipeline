const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

const outputDir = path.resolve(__dirname, '..', 'icons');
const sourcePath = path.join(outputDir, 'logo.png');
const sizes = [16, 48, 128];

function renderIcon(image, size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, size, size);

  return canvas.toBuffer('image/png');
}

async function generateIcons() {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Logo source not found: ${sourcePath}`);
  }

  const image = await loadImage(sourcePath);

  sizes.forEach((size) => {
    const outputPath = path.join(outputDir, `icon${size}.png`);

    if (image.width === size && image.height === size) {
      fs.copyFileSync(sourcePath, outputPath);
      return;
    }

    fs.writeFileSync(outputPath, renderIcon(image, size));
  });
}

generateIcons().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
