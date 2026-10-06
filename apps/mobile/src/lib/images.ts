import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { MAX_IMAGE_BYTES } from '@crm/contracts';

export type PickedImage = { uri: string; dataUrl: string };

type PickOptions = {
  /** Target output size; the picked image is centre-cropped to this aspect, then resized. */
  size: { width: number; height: number };
  format?: 'png' | 'jpeg';
  /** JPEG quality (0..1). */
  compress?: number;
};

export class ImageTooLargeError extends Error {
  constructor() {
    super('Image must be 5 MB or smaller');
  }
}

/**
 * Opens the photo library with the native crop UI, then centre-crops (iOS only offers a
 * square/free crop — `aspect` is Android-only) and resizes to the exact target size,
 * returning a base64 data URL ready for the BFF upload endpoints.
 */
export async function pickAndPrepareImage({ size, format = 'jpeg', compress = 0.85 }: PickOptions): Promise<PickedImage | null> {
  const aspect = size.width / size.height;
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: aspectTuple(size),
    quality: 1,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;

  const ctx = ImageManipulator.manipulate(asset.uri);
  const { width: w, height: h } = asset;
  if (w > 0 && h > 0 && Math.abs(w / h - aspect) > 0.01) {
    // Centre-crop to the target aspect ratio so nothing gets distorted.
    if (w / h > aspect) {
      const cw = Math.round(h * aspect);
      ctx.crop({ originX: Math.round((w - cw) / 2), originY: 0, width: cw, height: h });
    } else {
      const ch = Math.round(w / aspect);
      ctx.crop({ originX: 0, originY: Math.round((h - ch) / 2), width: w, height: ch });
    }
  }
  ctx.resize({ width: size.width, height: size.height });
  const ref = await ctx.renderAsync();
  const saved = await ref.saveAsync({
    base64: true,
    format: format === 'png' ? SaveFormat.PNG : SaveFormat.JPEG,
    compress: format === 'png' ? 1 : compress,
  });
  if (!saved.base64) throw new Error('Could not read the selected image');
  if ((saved.base64.length * 3) / 4 > MAX_IMAGE_BYTES) throw new ImageTooLargeError();
  return { uri: saved.uri, dataUrl: `data:image/${format};base64,${saved.base64}` };
}

function aspectTuple({ width, height }: { width: number; height: number }): [number, number] {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const g = gcd(width, height) || 1;
  return [width / g, height / g];
}
