// Turns the Vite build in dist/ into one self-contained file, Holdout.html, that plays
// straight from your file system with a double-click (no server, no install).
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
let html = readFileSync(join(dist, 'index.html'), 'utf8');
const assets = readdirSync(join(dist, 'assets'));

for (const file of assets) {
  const body = readFileSync(join(dist, 'assets', file), 'utf8');
  if (file.endsWith('.js')) {
    const tag = new RegExp(`<script[^>]*src="\\./assets/${file.replace('.', '\\.')}"[^>]*></script>`);
    const safe = body.replace(/<\/script/gi, '<\\/script');
    // Moved to the end of <body>: inline module scripts run immediately, after the DOM they need
    html = html.replace(tag, '');
    // A function replacer, so `$&` / `$'` sequences in the minified code are inserted literally
    html = html.replace('</body>', () => `<script type="module">\n${safe}\n</script>\n</body>`);
  } else if (file.endsWith('.css')) {
    const tag = new RegExp(`<link[^>]*href="\\./assets/${file.replace('.', '\\.')}"[^>]*>`);
    html = html.replace(tag, () => `<style>\n${body}\n</style>`);
  }
}

if (/\.\/assets\//.test(html)) throw new Error('An asset reference was not inlined');
writeFileSync('Holdout.html', html);
console.log(`Wrote Holdout.html (${(html.length / 1024).toFixed(0)} KB)`);
