import React, { useState } from 'react';
import { Package, Sparkles, Tag } from 'lucide-react';

interface ProductImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  category?: string;
  colour?: string;
}

// Deterministic gradient generator for consistent stylish product placeholders
function getPlaceholderGradient(name: string, colour?: string): string {
  const col = (colour || '').toLowerCase();
  if (col.includes('red') || col.includes('maroon') || col.includes('crimson')) {
    return 'from-rose-900 via-rose-800 to-amber-950 text-rose-200';
  }
  if (col.includes('blue') || col.includes('indigo') || col.includes('navy')) {
    return 'from-blue-900 via-indigo-900 to-slate-900 text-blue-200';
  }
  if (col.includes('green') || col.includes('emerald') || col.includes('mint')) {
    return 'from-emerald-900 via-teal-900 to-slate-950 text-emerald-200';
  }
  if (col.includes('yellow') || col.includes('gold') || col.includes('mustard')) {
    return 'from-amber-800 via-yellow-900 to-stone-950 text-amber-200';
  }
  if (col.includes('pink') || col.includes('peach') || col.includes('magenta')) {
    return 'from-pink-900 via-rose-900 to-slate-900 text-pink-200';
  }
  if (col.includes('purple') || col.includes('lavender') || col.includes('wine')) {
    return 'from-purple-900 via-violet-900 to-slate-950 text-purple-200';
  }

  // Fallback hash
  const colors = [
    'from-indigo-900 via-purple-900 to-slate-950 text-indigo-200',
    'from-slate-800 via-indigo-950 to-slate-900 text-slate-200',
    'from-teal-900 via-slate-900 to-emerald-950 text-teal-200',
    'from-cyan-900 via-blue-950 to-slate-900 text-cyan-200',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
  }
  return colors[Math.abs(hash) % colors.length];
}

export const ProductImage: React.FC<ProductImageProps> = ({
  src,
  alt,
  className = 'w-full h-full object-cover',
  category,
  colour,
}) => {
  const [hasError, setHasError] = useState(false);

  const showPlaceholder = !src || hasError;

  if (showPlaceholder) {
    const gradient = getPlaceholderGradient(alt, colour);
    // Get 2-letter initials
    const initials = alt
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('');

    return (
      <div
        className={`bg-gradient-to-br ${gradient} flex flex-col items-center justify-center p-3 relative overflow-hidden select-none ${className}`}
      >
        {/* Subtle patterned background */}
        <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:12px_12px]" />
        
        <div className="relative z-10 flex flex-col items-center text-center space-y-1.5">
          <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-lg">
            {initials ? (
              <span className="font-black text-sm tracking-widest text-white drop-shadow">
                {initials}
              </span>
            ) : (
              <Sparkles className="w-5 h-5 text-white/90" />
            )}
          </div>
          <span className="font-semibold text-[11px] text-white/90 line-clamp-1 max-w-[140px] drop-shadow-sm">
            {alt}
          </span>
          {colour && (
            <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-black/30 text-white/80 border border-white/10">
              {colour}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      onError={() => setHasError(true)}
      className={className}
      loading="lazy"
    />
  );
};
