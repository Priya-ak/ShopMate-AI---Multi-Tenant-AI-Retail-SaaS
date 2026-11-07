import React, { useRef, useState, useEffect } from 'react';
import { Upload, X, Check, RefreshCw, Layers, FileImage, AlertCircle } from 'lucide-react';
import {
  processImageFile,
  processMultipleImageFiles,
  revokeLocalFileReference,
  ProcessedImageResult,
} from '../utils/fileProcessing';

interface ImageUploadInputProps {
  value?: string | null;
  onChange: (dataUrl: string) => void;
  label?: string;
  helperText?: string;
  multiple?: boolean;
  values?: string[];
  onMultiChange?: (urls: string[]) => void;
  maxImages?: number;
}

export const ImageUploadInput: React.FC<ImageUploadInputProps> = ({
  value,
  onChange,
  label = 'Product Image Photo',
  helperText = 'Select JPEG, PNG, or WebP photo from your computer (auto-optimized)',
  multiple = false,
  values = [],
  onMultiChange,
  maxImages = 5,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [lastMeta, setLastMeta] = useState<ProcessedImageResult | null>(null);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      if (lastMeta?.localRef) {
        revokeLocalFileReference(lastMeta.localRef);
      }
    };
  }, [lastMeta]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setErrorMessage(null);
    setIsProcessing(true);

    try {
      if (multiple && onMultiChange) {
        const results = await processMultipleImageFiles(files, {
          maxWidth: 1200,
          maxHeight: 1200,
          quality: 0.85,
        });

        const newUrls = results.map((r) => r.dataUrl);
        const combined = [...values, ...newUrls].slice(0, maxImages);
        onMultiChange(combined);

        if (results.length > 0) {
          setLastMeta(results[0]);
          if (!value && newUrls[0]) {
            onChange(newUrls[0]);
          }
        }
      } else {
        const file = files[0];
        const result = await processImageFile(file, {
          maxWidth: 1200,
          maxHeight: 1200,
          quality: 0.85,
        });

        setLastMeta(result);
        onChange(result.dataUrl);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to process image file');
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleClearSingle = () => {
    onChange('');
    setLastMeta(null);
    setErrorMessage(null);
  };

  const handleRemoveMultiIndex = (indexToRemove: number) => {
    if (!onMultiChange) return;
    const updated = values.filter((_, idx) => idx !== indexToRemove);
    onMultiChange(updated);
    if (updated.length > 0) {
      onChange(updated[0]);
    } else {
      onChange('');
    }
  };

  // Determine active display images
  const currentImages = multiple && values.length > 0 ? values : value ? [value] : [];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-slate-300 font-medium text-xs flex items-center gap-1.5">
          <FileImage className="w-3.5 h-3.5 text-indigo-400" />
          <span>{label}</span>
          {multiple && (
            <span className="text-[10px] text-slate-500">
              ({currentImages.length}/{maxImages} images)
            </span>
          )}
        </label>

        {currentImages.length > 0 && !multiple && (
          <button
            type="button"
            onClick={handleClearSingle}
            className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-1 transition"
          >
            <X className="w-3 h-3" />
            <span>Remove Photo</span>
          </button>
        )}
      </div>

      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        multiple={multiple}
        className="hidden"
      />

      {/* Error alert if processing failed */}
      {errorMessage && (
        <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center gap-2 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Uploaded Image Previews */}
      {currentImages.length > 0 ? (
        <div className="space-y-2.5">
          {multiple ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {currentImages.map((imgSrc, idx) => (
                <div
                  key={idx}
                  className="relative group rounded-xl overflow-hidden bg-slate-950 border border-slate-700/80 aspect-square shadow-inner"
                >
                  <img src={imgSrc} alt={`Product ${idx + 1}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => handleRemoveMultiIndex(idx)}
                    className="absolute top-1 right-1 p-1 rounded-full bg-slate-950/80 hover:bg-rose-600 text-slate-300 hover:text-white transition shadow opacity-90 group-hover:opacity-100"
                    title="Remove image"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  {idx === 0 && (
                    <span className="absolute bottom-1 left-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-600/90 text-white backdrop-blur-xs">
                      Primary
                    </span>
                  )}
                </div>
              ))}

              {currentImages.length < maxImages && (
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-xl border-2 border-dashed border-slate-700 hover:border-indigo-500 bg-slate-800/40 hover:bg-slate-800/70 transition flex flex-col items-center justify-center p-2 text-slate-400 hover:text-indigo-300 aspect-square text-center cursor-pointer"
                >
                  <Upload className="w-4 h-4 mb-1" />
                  <span className="text-[10px] font-semibold">Add Photo</span>
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3.5 p-3 rounded-xl bg-slate-800/80 border border-slate-700/80 shadow-xs">
              <div className="w-16 h-16 rounded-lg bg-slate-950 overflow-hidden relative border border-slate-700 shrink-0 shadow-inner">
                <img src={currentImages[0]} alt="Uploaded Preview" className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                  <Check className="w-3.5 h-3.5" />
                  <span>Local image processed & attached</span>
                </div>
                <p className="text-[11px] text-slate-400 truncate mt-0.5">
                  {lastMeta ? `${lastMeta.name} (${lastMeta.formattedCompressedSize})` : 'Product imagery attached'}
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-1.5 text-[11px] font-medium text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Choose Another Image</span>
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Dropzone / Upload button */
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`w-full py-5 px-4 rounded-xl border-2 border-dashed transition flex flex-col items-center justify-center gap-2 group cursor-pointer text-center select-none ${
            isDragOver
              ? 'border-indigo-400 bg-indigo-500/10'
              : 'border-slate-700 hover:border-indigo-500 bg-slate-800/40 hover:bg-slate-800/70'
          }`}
        >
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 group-hover:bg-indigo-500 group-hover:text-white transition flex items-center justify-center shadow-sm">
            {isProcessing ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <Upload className="w-5 h-5" />
            )}
          </div>
          <div>
            <span className="text-xs font-bold text-slate-200 group-hover:text-white block">
              {isProcessing ? 'Optimizing local file...' : 'Upload Product Photo'}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              {helperText}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
