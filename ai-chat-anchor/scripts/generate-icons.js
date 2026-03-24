const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

const outputDir = path.resolve(__dirname, '..', 'icons');
const sizes = [16, 48, 128];

function drawRoundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawPill(ctx, x, y, width, height, color) {
  drawRoundedRect(ctx, x, y, width, height, height / 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function renderIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  const scale = size / 128;
  const gradient = ctx.createLinearGradient(18 * scale, 12 * scale, 108 * scale, 116 * scale);
  gradient.addColorStop(0, '#C55BFF');
  gradient.addColorStop(1, '#8D3DFF');

  ctx.clearRect(0, 0, size, size);

  ctx.shadowColor = 'rgba(127, 52, 242, 0.28)';
  ctx.shadowBlur = 10 * scale;
  ctx.shadowOffsetY = 8 * scale;
  drawRoundedRect(ctx, 8 * scale, 8 * scale, 112 * scale, 112 * scale, 30 * scale);
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.shadowColor = 'transparent';
  drawPill(ctx, 42 * scale, 31 * scale, 44 * scale, 14 * scale, '#FFFFFF');
  drawPill(ctx, 28 * scale, 57 * scale, 72 * scale, 14 * scale, '#FFFFFF');
  drawPill(ctx, 38 * scale, 83 * scale, 52 * scale, 14 * scale, '#FFFFFF');

  return canvas.toBuffer('image/png');
}

fs.mkdirSync(outputDir, { recursive: true });

sizes.forEach((size) => {
  const buffer = renderIcon(size);
  fs.writeFileSync(path.join(outputDir, `icon${size}.png`), buffer);
});

