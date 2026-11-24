/**
 * Pictures for the games portal (covers, headers, screenshots) leave the browser scaled
 * down: an 8 MB phone photo becomes a JPEG of a few hundred KB, which is also what link
 * previews show most reliably.
 */

/** The size `width × height` fits in `maxWidth × maxHeight` keeping its shape (never larger). */
export function fitWithin(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** The picture as a JPEG no larger than `maxWidth × maxHeight` (transparency on the page's dark). */
export async function scaleDown(
  file: Blob,
  maxWidth: number,
  maxHeight: number,
  quality = 0.88
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxWidth, maxHeight);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available');
    ctx.fillStyle = '#141615';
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', quality)
    );
    if (!blob) throw new Error('Could not encode the picture');
    return blob;
  } finally {
    bitmap.close();
  }
}
