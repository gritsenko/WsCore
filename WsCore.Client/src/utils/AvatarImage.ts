/** Avatars are stored and shown as small squares; the server caps the file size. */
export const AVATAR_SIZE = 128;
export const AVATAR_MAX_BYTES = 48 * 1024;

/**
 * Turns a picture the user picked into the avatar file we upload: centre-cropped to a
 * square, scaled to AVATAR_SIZE and encoded as JPEG (a few KB) — so the original, which
 * may be a multi-megabyte photo, never leaves the browser. Rejects if the file is not
 * an image the browser can decode.
 */
export async function prepareAvatar(file: Blob): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available');

    // JPEG has no alpha: transparent areas would turn black.
    ctx.fillStyle = '#1c1f1e';
    ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
    const side = Math.min(bitmap.width, bitmap.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      AVATAR_SIZE,
      AVATAR_SIZE
    );

    for (const quality of [0.85, 0.7, 0.5]) {
      const blob = await new Promise<Blob | null>(resolve =>
        canvas.toBlob(resolve, 'image/jpeg', quality)
      );
      if (blob && blob.size <= AVATAR_MAX_BYTES) return new Uint8Array(await blob.arrayBuffer());
    }
    throw new Error('The image is too large');
  } finally {
    bitmap.close();
  }
}
