import sharp from "sharp";
import { writeFileSync } from "fs";

// SVG du logo PASSIO Ascension
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="gA" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ddd6fe"/>
      <stop offset="1" stop-color="#7c3aed"/>
    </linearGradient>
  </defs>
  <rect width="100" height="100" rx="22" fill="url(#gA)"/>
  <path d="M30 30 L70 30 L30 70" stroke="#ffffff" stroke-width="11" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <path d="M70 30 L70 70" stroke="#4c1d95" stroke-width="11" stroke-linecap="round" fill="none"/>
</svg>`;

const buf = Buffer.from(svg);

await sharp(buf).resize(192, 192).png().toFile("icon-192.png");
console.log("✓ icon-192.png");

await sharp(buf).resize(512, 512).png().toFile("icon-512.png");
console.log("✓ icon-512.png");
