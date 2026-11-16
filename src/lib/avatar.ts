import { LIMITS } from '@/lib/limits';

/** Shrink a chosen picture to a small JPEG stored on the profile document. */
export async function photoFromFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
  if (file.size >= LIMITS.avatarBytes) throw new Error('Images need to be smaller than 5 MB.');

  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('This picture could not be read. Choose a JPEG or PNG.');
  });

  try {
    let edge = 160;
    let quality = 0.72;
    let url = '';
    for (let attempt = 0; attempt < 8; attempt += 1) {
      url = renderJpeg(bitmap, edge, quality);
      if (url.length <= LIMITS.photoUrlMax) return url;
      if (quality > 0.45) quality = Math.round((quality - 0.09) * 100) / 100;
      else edge = Math.max(48, Math.round(edge * 0.75));
    }
    throw new Error('That picture is still too large. Try another one.');
  } finally {
    bitmap.close();
  }
}

function renderJpeg(bitmap: ImageBitmap, edge: number, quality: number): string {
  const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser could not prepare the picture.');
  context.drawImage(bitmap, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', quality);
}
