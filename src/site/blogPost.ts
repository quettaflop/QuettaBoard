import type { ComponentType } from 'react';

export interface BlogPostMetadata {
  title: string;
  date: string;
  summary: string;
  category: string;
  readingMinutes: number;
}

export interface BlogPost extends BlogPostMetadata {
  slug: string;
  Body: ComponentType;
}

/** Shared by the browser catalogue and static-route build. */
export function validatePostMetadata(post: BlogPostMetadata, slug: string): void {
  const date = new Date(`${post.date}T00:00:00Z`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
    || !/^\d{4}-\d{2}-\d{2}$/.test(post.date)
    || !Number.isFinite(date.getTime())
    || date.toISOString().slice(0, 10) !== post.date
    || typeof post.title !== 'string' || !post.title.trim()
    || typeof post.summary !== 'string' || !post.summary.trim()
    || typeof post.category !== 'string' || !post.category.trim()
    || !Number.isInteger(post.readingMinutes) || post.readingMinutes < 1) {
    throw new Error(`Invalid blog post metadata: ${slug}`);
  }
}
