import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { validatePostMetadata, type BlogPostMetadata } from '../src/site/blogPost';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = resolve(root, 'dist-site');
const html = await readFile(resolve(out, 'site.html'), 'utf8');
const escape = (text: string) => text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

async function page(path: string, title: string, description?: string) {
  const dir = resolve(out, path);
  await mkdir(dir, { recursive: true });
  let source = html.replace(/<title>.*?<\/title>/, () => `<title>${escape(title)}</title>`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, (_, before, after) => `${before}${escape(title)}${after}`);
  if (description) {
    source = source.replace(/(<meta\s+name="description"\s+content=")[^"]*(")/, (_, before, after) => `${before}${escape(description)}${after}`)
      .replace(/(<meta\s+property="og:description"\s+content=")[^"]*(")/, (_, before, after) => `${before}${escape(description)}${after}`);
  }
  await writeFile(resolve(dir, 'index.html'), source);
}

await page('', 'Quettaflop AI');
await page('efficiency', 'Efficiency Index — Quettaflop AI');
await page('blog', 'Blog — Quettaflop AI', 'Hardware, serving systems, and notes from the Quettaflop inference lab.');
await page('careers', 'Careers — Quettaflop AI', 'Build tools to measure, model, and run AI inference. Get in touch with Quettaflop about serving systems, GPU performance, and simulation.');

const published = resolve(root, 'src/site/posts/published');
for (const entry of await readdir(published, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const slug = entry.name;
  const post = JSON.parse(await readFile(resolve(published, slug, 'post.json'), 'utf8')) as BlogPostMetadata;
  validatePostMetadata(post, slug);
  await access(resolve(published, slug, 'Body.tsx'));
  await page(`blog/${slug}`, `${post.title} — Quettaflop AI`, post.summary);
}
// Keep site.html for the existing single-file exporter and dev-style links.
console.log('✓ static routes: home, efficiency, blog, careers, and published articles');
