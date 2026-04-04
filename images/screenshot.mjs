import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(__dirname, 'banner.html');
const outPath = join(__dirname, 'banner.png');

const chrome = execSync('find ~/.cache/puppeteer -name "Google Chrome for Testing" -type f 2>/dev/null | head -1').toString().trim();
if (!chrome) {
  console.error('Chrome not found');
  process.exit(1);
}

execSync(`"${chrome}" --headless --disable-gpu --screenshot="${outPath}" --window-size=800,260 --force-device-scale-factor=5 --hide-scrollbars "file://${htmlPath}"`, { stdio: 'inherit' });
console.log('Saved banner.png');
