/**
 * Turns a generated film page into an MP4, one frame at a time.
 *
 *   node scripts/render-social.mjs           # assets/brand/film.html
 *   node scripts/render-social.mjs launch    # assets/brand/launch.html
 *
 * ## Why a frame at a time
 *
 * The obvious approach is to let a CSS animation run and record the tab. It
 * gives a different film every time: a screenshot of a playing animation lands
 * wherever the renderer happened to be when the shutter opened, so a re-render
 * to fix one wrong word silently changes every other frame too.
 *
 * The film pages instead compute their whole state from `?f=N`. This asks for
 * each N in turn, which makes the output reproducible, lets a single bad second
 * be re-rendered on its own, and — the reason it was written — makes the frames
 * readable afterwards. A film once displayed 385 commit histories against a
 * ledger holding 387, and that was invisible until somebody read a frame back.
 *
 * ## Requirements
 *
 * Chrome or Edge, and ffmpeg. Both are checked before a hundred screenshots are
 * taken rather than after. The page is served over HTTP rather than opened from
 * disk: `file://` refuses the stylesheet and font requests, and the first render
 * of these cards came out unstyled because of exactly that.
 */

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const name = process.argv[2] ?? 'film';
const page = `assets/brand/${name}.html`;

if (!existsSync(join(ROOT, page))) {
  console.error(`no such film: ${page}`);
  console.error(`run: node scripts/build-${name === 'film' ? 'social' : name}.mjs`);
  process.exit(1);
}

/** Frame count, read from the page rather than passed in and left to drift. */
const source = readFileSync(join(ROOT, page), 'utf8');
const fps = Number(/var FPS = (\d+)/.exec(source)?.[1] ?? /const FPS = (\d+)/.exec(source)?.[1] ?? 30);
const seconds = Number(/var SECONDS = (\d+)/.exec(source)?.[1] ?? 8);
const frames = fps * seconds;

const WIDTH = 1200;
const HEIGHT = 675;

/**
 * Chrome, wherever this machine keeps it.
 *
 * Edge is accepted because it is the same engine and is present on every
 * Windows install, which is where this is run.
 */
const CANDIDATES = [
  process.env['CHROME_PATH'],
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

const chrome = CANDIDATES.find((path) => existsSync(path));
if (!chrome) {
  console.error('no Chrome or Edge found. Set CHROME_PATH.');
  process.exit(1);
}

const run = (cmd, args, opts = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'ignore', ...opts });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });

await run('ffmpeg', ['-version']).catch(() => {
  console.error('ffmpeg not found on PATH.');
  process.exit(1);
});

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
};

/**
 * Serves the repository root read-only on a loopback port.
 *
 * Paths are resolved and then checked to be inside the root, because a film
 * page is generated and a generated path is still a path.
 */
const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = join(ROOT, decodeURIComponent(url.pathname).replace(/^\/+/, ''));
  if (!path.startsWith(ROOT) || !existsSync(path) || statSync(path).isDirectory()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
  res.end(readFileSync(path));
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;

const out = join(ROOT, 'assets/brand/frames');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

process.stdout.write(`rendering ${frames} frames `);
for (let f = 0; f < frames; f++) {
  await run(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--window-size=${WIDTH},${HEIGHT}`,
    `--screenshot=${join(out, String(f).padStart(4, '0'))}.png`,
    '--virtual-time-budget=1200',
    `http://127.0.0.1:${port}/${page}?f=${f}`,
  ]);
  if (f % 30 === 0) process.stdout.write('.');
}
process.stdout.write('\n');

server.close();

const mp4 = join(ROOT, `assets/brand/${name}.mp4`);
rmSync(mp4, { force: true });

// yuv420p, because every social platform re-encodes and the ones that cannot
// read the pixel format simply show a black rectangle.
//
// It also demands even dimensions in both axes, and 16:9 at this width is
// 1200x675 — an odd height, which libx264 refuses outright. So the frame is
// padded up to the next even number rather than scaled to it: a one-pixel
// resample is invisible on a photograph and very visible on 24px monospace,
// and every frame here is type. The pad colour is the film's own background,
// so the added row cannot be seen.
await run(
  'ffmpeg',
  [
    '-y', '-framerate', String(fps),
    '-i', join(out, '%04d.png'),
    '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2:0:0:0x121212',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18',
    '-movflags', '+faststart',
    mp4,
  ],
  { stdio: 'inherit' },
);

rmSync(out, { recursive: true, force: true });
console.log(`${name}.mp4 — ${frames} frames, ${seconds}s, ${(statSync(mp4).size / 1024).toFixed(0)}KB`);
