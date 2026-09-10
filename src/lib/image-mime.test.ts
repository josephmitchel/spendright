import { describe, expect, it } from 'vitest';
import { base64ImageMime } from '@/lib/image-mime';

describe('base64ImageMime', () => {
  it('sniffs png, jpeg, gif and webp from base64 magic bytes', () => {
    expect(base64ImageMime('iVBORw0KGgo=')).toBe('image/png');
    expect(base64ImageMime('/9j/4AAQSkZJRg==')).toBe('image/jpeg');
    expect(base64ImageMime('R0lGODlhAQ==')).toBe('image/gif');
    expect(base64ImageMime('UklGRh4AAABXRUJQ')).toBe('image/webp');
  });

  it('returns null for unknown formats so the caller does not render them', () => {
    expect(base64ImageMime('PHN2ZyB4bWxucz0i')).toBeNull();
    expect(base64ImageMime('')).toBeNull();
  });
});
