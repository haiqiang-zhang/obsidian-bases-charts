import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(__dirname, 'data-charts-showcase.html');
const outPath = join(__dirname, 'data-charts.png');

const chrome = execSync('find ~/.cache/puppeteer -name "Google Chrome for Testing" -type f 2>/dev/null | head -1').toString().trim();
if (!chrome) {
  console.error('Chrome not found');
  process.exit(1);
}

// Render with a tall window to capture full content
execSync(`"${chrome}" --headless --disable-gpu --screenshot="${outPath}" --window-size=1000,1060 --force-device-scale-factor=3 --hide-scrollbars "file://${htmlPath}"`, { stdio: 'inherit' });
console.log('Saved data-charts.png');
