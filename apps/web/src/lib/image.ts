import { ACCEPTED_IMAGE_TYPES, MAX_IMAGE_BYTES } from '@crm/contracts';

export type PixelArea = { x: number; y: number; width: number; height: number };

export type ImageFileProblem = 'type' | 'size' | null;

export function checkImageFile(file: File): ImageFileProblem {
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) return 'type';
  if (file.size > MAX_IMAGE_BYTES) return 'size';
  return null;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image failed to load'));
    img.src = src;
  });
}

/**
 * Draws the cropped region into a canvas of exactly `output` size (no stretching: the crop
 * area already has the target aspect ratio) and returns a data URL.
 */
export async function cropToDataUrl(
  src: string,
  area: PixelArea,
  output: { width: number; height: number },
  mime: 'image/png' | 'image/jpeg' | 'image/webp' = 'image/jpeg',
  quality = 0.9,
): Promise<string> {
  const img = await loadImage(src);
  const canvas = document.createElement('canvas');
  canvas.width = output.width;
  canvas.height = output.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.imageSmoothingQuality = 'high';
  if (mime === 'image/jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, output.width, output.height);
  }
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, output.width, output.height);
  return canvas.toDataURL(mime, quality);
}
