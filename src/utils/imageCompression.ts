const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_INPUT_BYTES = 15 * 1024 * 1024;

export interface CompressedImageResult {
  blob: Blob;
  extension: 'webp' | 'jpg';
  mimeType: 'image/webp' | 'image/jpeg';
  width: number;
  height: number;
}

function loadFileAsImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not decode selected image file.'));
    };
    img.src = objectUrl;
  });
}

export async function compressImageFile(
  file: File,
  maxDimension = 1000,
  quality = 0.82
): Promise<CompressedImageResult> {
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new Error('Only JPEG, PNG, and WebP images are supported.');
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error('Image file must be under 15 MB before compression.');
  }

  const img = await loadFileAsImage(file);
  const srcWidth = img.naturalWidth || img.width;
  const srcHeight = img.naturalHeight || img.height;
  if (!srcWidth || !srcHeight) {
    throw new Error('Selected image has invalid dimensions.');
  }

  const scale = Math.min(1, maxDimension / Math.max(srcWidth, srcHeight));
  const targetWidth = Math.max(1, Math.round(srcWidth * scale));
  const targetHeight = Math.max(1, Math.round(srcHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas image processing is unavailable in this browser.');
  }
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  const exportBlob = (mime: 'image/webp' | 'image/jpeg') =>
    new Promise<Blob | null>(resolve => canvas.toBlob(resolve, mime, quality));

  let blob = await exportBlob('image/webp');
  let mimeType: 'image/webp' | 'image/jpeg' = 'image/webp';
  let extension: 'webp' | 'jpg' = 'webp';

  if (!blob || blob.type !== 'image/webp') {
    blob = await exportBlob('image/jpeg');
    mimeType = 'image/jpeg';
    extension = 'jpg';
  }

  if (!blob) {
    throw new Error('Failed to compress selected image.');
  }

  return {
    blob,
    extension,
    mimeType,
    width: targetWidth,
    height: targetHeight
  };
}
