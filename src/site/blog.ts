import type { ComponentType } from 'react';
import { validatePostMetadata, type BlogPost, type BlogPostMetadata } from './blogPost';

// Drafts live outside these globs and never enter the public module graph.
const metadata = import.meta.glob<BlogPostMetadata>('./posts/published/*/post.json', { eager: true, import: 'default' });
const bodies = import.meta.glob<ComponentType>('./posts/published/*/Body.tsx', { eager: true, import: 'default' });

if (Object.keys(metadata).length !== Object.keys(bodies).length) {
  throw new Error('Each published blog post needs post.json and Body.tsx');
}

export const POSTS: BlogPost[] = Object.entries(metadata)
  .map(([path, post]) => {
    const slug = path.split('/').slice(-2)[0];
    validatePostMetadata(post, slug);
    const Body = bodies[path.replace('/post.json', '/Body.tsx')];
    if (typeof Body !== 'function') throw new Error(`Missing blog post body: ${slug}`);
    return { ...post, slug, Body };
  })
  .sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
