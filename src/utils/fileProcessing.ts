/**
 * File processing utility to handle local file references and image optimization for product imagery.
 * Converts local user-selected File objects into optimized, compressed data URLs for persistence
 * and manages temporary local object URLs for instant zero-latency UI previews.
 */

export interface ImageProcessingOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  outputFormat?: 'image/jpeg' | 'image/webp' | 'image/png';
  maxSizeBytes?: number;
}

export interface ProcessedImageResult {
  dataUrl: string;
  localRef: string;
  name: string;
  originalSize: number;
  compressedSize: number;
  formattedOriginalSize: string;
  formattedCompressedSize: string;
  width: number;
  height: number;
  mimeType: string;
}

const DEFAULT_OPTIONS: Required<ImageProcessingOptions> = {
  maxWidth: 1024,
  maxHeight: 1024,
  quality: 0.85,
  outputFormat: 'image/jpeg',
  maxSizeBytes: 15 * 1024 * 1024, // 15MB limit
};

/**
 * Format bytes into human-readable string (e.g., 250 KB, 1.4 MB).
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Validate that a file is an accepted image format and within size bounds.
 */
export function validateImageFile(file: File, maxSizeBytes = DEFAULT_OPTIONS.maxSizeBytes): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: 'No file provided.' };
  }

  const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'image/avif'];
  if (!file.type || !validTypes.some((t) => file.type.startsWith('image/'))) {
    return {
      valid: false,
      error: `Invalid file type "${file.type || 'unknown'}". Please select a JPEG, PNG, WebP, or GIF image.`,
    };
  }

  if (file.size > maxSizeBytes) {
    return {
      valid: false,
      error: `File size (${formatFileSize(file.size)}) exceeds the maximum allowed limit of ${formatFileSize(maxSizeBytes)}.`,
    };
  }

  return { valid: true };
}

/**
 * Creates a local object URL reference for instantaneous preview.
 */
export function createLocalFileReference(file: File): string {
  try {
    return URL.createObjectURL(file);
  } catch {
    return '';
  }
}

/**
 * Revokes a previously created local object URL reference to prevent memory leaks.
 */
export function revokeLocalFileReference(url?: string | null): void {
  if (url && url.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // Ignored
    }
  }
}

/**
 * Processes a single local image File:
 * 1. Validates the file
 * 2. Generates an instant local object URL reference
 * 3. Compresses and resizes via HTML5 Canvas
 * 4. Returns both the persistent dataUrl and metadata
 */
export async function processImageFile(
  file: File,
  options?: ImageProcessingOptions
): Promise<ProcessedImageResult> {
  const opts: Required<ImageProcessingOptions> = { ...DEFAULT_OPTIONS, ...options };

  const validation = validateImageFile(file, opts.maxSizeBytes);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const localRef = createLocalFileReference(file);

  return new Promise<ProcessedImageResult>((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      try {
        let width = img.width;
        let height = img.height;

        // Calculate aspect-ratio preserved scaling
        if (width > height) {
          if (width > opts.maxWidth) {
            height = Math.round((height * opts.maxWidth) / width);
            width = opts.maxWidth;
          }
        } else {
          if (height > opts.maxHeight) {
            width = Math.round((width * opts.maxHeight) / height);
            height = opts.maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Canvas 2D context unavailable for image processing.');
        }

        // Apply high quality smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Fill background white for JPEG outputs to prevent dark transparency artifacts
        if (opts.outputFormat === 'image/jpeg') {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
        }

        ctx.drawImage(img, 0, 0, width, height);

        const format = file.type === 'image/png' && opts.outputFormat !== 'image/jpeg' ? 'image/png' : opts.outputFormat;
        const dataUrl = canvas.toDataURL(format, opts.quality);

        // Approximate size of base64 dataUrl
        const base64Length = dataUrl.length - (dataUrl.indexOf(',') + 1);
        const compressedSize = Math.round((base64Length * 3) / 4);

        resolve({
          dataUrl,
          localRef,
          name: file.name,
          originalSize: file.size,
          compressedSize,
          formattedOriginalSize: formatFileSize(file.size),
          formattedCompressedSize: formatFileSize(compressedSize),
          width,
          height,
          mimeType: format,
        });
      } catch (err: any) {
        // Fallback: Read raw as DataURL
        const reader = new FileReader();
        reader.onload = () => {
          resolve({
            dataUrl: reader.result as string,
            localRef,
            name: file.name,
            originalSize: file.size,
            compressedSize: file.size,
            formattedOriginalSize: formatFileSize(file.size),
            formattedCompressedSize: formatFileSize(file.size),
            width: img.width || 0,
            height: img.height || 0,
            mimeType: file.type || 'image/jpeg',
          });
        };
        reader.onerror = () => reject(new Error('Failed to read image as data URL fallback.'));
        reader.readAsDataURL(file);
      }
    };

    img.onerror = () => {
      reject(new Error(`Failed to decode image file "${file.name}". File might be corrupted.`));
    };

    // Trigger load from local object URL reference or fallback to FileReader
    if (localRef) {
      img.src = localRef;
    } else {
      const fallbackReader = new FileReader();
      fallbackReader.onload = () => {
        img.src = fallbackReader.result as string;
      };
      fallbackReader.onerror = () => reject(new Error('Failed to read image file.'));
      fallbackReader.readAsDataURL(file);
    }
  });
}

/**
 * Process a collection of multiple files concurrently.
 */
export async function processMultipleImageFiles(
  files: FileList | File[],
  options?: ImageProcessingOptions
): Promise<ProcessedImageResult[]> {
  const fileArray = Array.from(files);
  const results: ProcessedImageResult[] = [];
  const errors: string[] = [];

  for (const file of fileArray) {
    try {
      const res = await processImageFile(file, options);
      results.push(res);
    } catch (err: any) {
      errors.push(`${file.name}: ${err.message || 'Processing failed'}`);
    }
  }

  if (results.length === 0 && errors.length > 0) {
    throw new Error(errors.join('\n'));
  }

  return results;
}
