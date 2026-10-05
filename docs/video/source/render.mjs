// Renders the Cowork tour (index.html) frame by frame with Playwright's Chromium and pipes the
// frames to ffmpeg. Run from the repository root (docs/VIDEO.md):
//   node docs/video/source/render.mjs <es|en> <out.mp4>            → full video, no sound
//   node docs/video/source/render.mjs <es|en> --stills 1,24,50       → PNG stills in docs/video/source/out/
import http from "node:http";
import { mkdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const [lang = "es", mode, arg] = process.argv.slice(2);
const root = fileURLToPath(new URL(".", import.meta.url));
const version = readFileSync(join(root, "..", "..", "..", "VERSION"), "utf8").trim();
const FPS = 30;
const TYPES = { ".html": "text/html", ".png": "image/png", ".svg": "image/svg+xml", ".js": "text/javascript" };

const server = http.createServer((request, response) => {
  const file = join(root, decodeURIComponent(request.url.split("?")[0]));
  try {
    response.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" });
    response.end(readFileSync(file));
  } catch {
    response.writeHead(404);
    response.end();
  }
}).listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));

const browser = await chromium.launch({ args: ["--hide-scrollbars", "--force-color-profile=srgb", "--font-render-hinting=none"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on("pageerror", (error) => console.error("page:", error.message));
await page.goto(`http://127.0.0.1:${server.address().port}/index.html?lang=${lang}&version=${version}`, { waitUntil: "networkidle" });
const duration = await page.evaluate(() => window.ready);

if (mode === "--stills") {
  mkdirSync(join(root, "out"), { recursive: true });
  for (const t of arg.split(",").map(Number)) {
    await page.evaluate((time) => window.render(time), t);
    await page.screenshot({ path: join(root, "out", `${lang}-${t}.png`) });
  }
} else {
  const ffmpeg = spawn("ffmpeg", ["-y", "-v", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
    "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p", "-tune", "animation", "-movflags", "+faststart", mode],
  { stdio: ["pipe", "ignore", "inherit"] });
  const frames = Math.round(duration * FPS);
  for (let index = 0; index < frames; index += 1) {
    await page.evaluate((time) => window.render(time), index / FPS);
    const frame = await page.screenshot({ type: "jpeg", quality: 95 });
    if (!ffmpeg.stdin.write(frame)) await new Promise((resolve) => ffmpeg.stdin.once("drain", resolve));
    if (index % 300 === 0) console.log(`${lang}: ${index}/${frames}`);
  }
  ffmpeg.stdin.end();
  await new Promise((resolve) => ffmpeg.on("close", resolve));
}
await browser.close();
server.close();
