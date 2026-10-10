import { POSTS } from '../blog';
import type { BlogPost } from '../blogPost';
import { siteBlogHref } from '../sitePaths';
import { SiteNav } from './SiteNav';
import { ArrowRight } from './icons';

function PostDate({ date }: { date: string }) {
  return <time dateTime={date}>{new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}</time>;
}

function PostList({ posts }: { posts: BlogPost[] }) {
  return (
    <div className="post-list">
      {posts.map((post) => (
        <a key={post.slug} href={siteBlogHref(post.slug)} className="post-card">
          <div className="post-meta"><span>{post.category}</span><PostDate date={post.date} /></div>
          <h3>{post.title}</h3>
          <p>{post.summary}</p>
          <span className="post-read">{post.readingMinutes} min read <ArrowRight size={20} /></span>
        </a>
      ))}
    </div>
  );
}

function FirstPosts() {
  return (
    <div className="blog-empty">
      <span className="blog-empty-mark" aria-hidden="true">↗</span>
      <div><h3>First posts are on the way.</h3><p>Experiments, benchmarks, and notes from building the Quettaflop stack.</p></div>
      <span className="eyebrow">Stay curious.</span>
    </div>
  );
}

export function BlogSection() {
  return (
    <section className="blog-section shell" aria-labelledby="blog-section-title">
      <div className="section-heading section-heading-row">
        <div><p className="eyebrow">From the lab</p><h2 id="blog-section-title">Notes on inference.</h2></div>
        <a href={siteBlogHref()} className="text-link">All posts <ArrowRight size={18} /></a>
      </div>
      {POSTS.length ? <PostList posts={POSTS.slice(0, 3)} /> : <FirstPosts />}
    </section>
  );
}

export function Blog({ slug }: { slug: string | null }) {
  const post = POSTS.find((p) => p.slug === slug);
  if (slug && !post) {
    return (
      <><SiteNav page="blog" /><main id="main" className="blog-page shell">
        <p className="eyebrow">404 · Post not found</p><h1>This page hasn’t been written.</h1>
        <a href={siteBlogHref()} className="text-link">Back to the blog <ArrowRight size={18} /></a>
      </main></>
    );
  }
  if (post) {
    const Body = post.Body;
    return (
      <><SiteNav page="blog" /><main id="main" className="article-page shell">
        <a href={siteBlogHref()} className="text-link article-back">← All posts</a>
        <article>
          <header className="article-header">
            <p className="eyebrow">{post.category}</p>
            <h1>{post.title}</h1>
            <p className="article-summary">{post.summary}</p>
            <div className="post-meta"><span>Quettaflop AI</span><PostDate date={post.date} /><span>{post.readingMinutes} min read</span></div>
          </header>
          <div className="article-body"><Body /></div>
        </article>
      </main></>
    );
  }
  return (
    <><SiteNav page="blog" /><main id="main" className="blog-page shell">
      <header className="section-heading">
        <p className="eyebrow">The Quettaflop blog</p>
        <h1>Notes from<br />the inference lab<span className="hero-period">.</span></h1>
        <p>Hardware, serving systems, and the work between a model and its next token.</p>
      </header>
      <section aria-labelledby="latest-posts-title">
        <h2 id="latest-posts-title" className="sr-only">Latest posts</h2>
        {POSTS.length ? <PostList posts={POSTS} /> : <FirstPosts />}
      </section>
    </main></>
  );
}
