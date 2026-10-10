# Publishing a blog post

The marketing site has a blog at `/blog/`, article pages at `/blog/<slug>/`,
and the three newest published posts on the homepage. It uses the existing
React/Vite app and needs no CMS or additional dependency.

1. Copy `src/site/posts/drafts/why-measure-inference-per-turn/` to a new folder
   inside `drafts/`. Use a lowercase folder name with hyphens; it becomes the URL slug.
2. Edit `post.json`: title, date (`YYYY-MM-DD`), summary, category, and reading time.
   Write the article in `Body.tsx` using normal React elements: paragraphs,
   headings, lists, links, code, figures, or existing site charts. Import images
   as local assets; do not depend on remote scripts or runtime data fetches.
3. When ready, move the whole folder into `src/site/posts/published/`.
4. Run `npm run build:site`. The build validates metadata, writes a direct-load
   HTML route with the article title and description, and checks the Index in a browser.
5. Preview the article, then deploy through the usual website workflow.

Only folders in `published/` enter the public bundle. Drafts are type-checked
but absent from the public index, article routes, and JavaScript. Posts are sorted
newest first by date, then by slug; moving one back to `drafts/` unpublishes it
on the next build. Do not put credentials or private traces in either directory.

To preview a draft, temporarily move its folder into `published/`, run
`npm run dev:site`, and open `/site.html#blog/<slug>`. Move it back before building
any public preview. The supplied draft uses the measured trace already on the
homepage and is a starting point for review, not a published article.
