// Dependency-free — bundled into client code. The provider doesn't guarantee
// a logo format, so sniff the base64 magic bytes; null means don't render it.
export function base64ImageMime(base64: string): string | null {
  if (base64.startsWith('iVBOR')) return 'image/png';
  if (base64.startsWith('/9j/')) return 'image/jpeg';
  if (base64.startsWith('R0lGOD')) return 'image/gif';
  if (base64.startsWith('UklGR')) return 'image/webp';
  return null;
}
