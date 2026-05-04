import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';

const TENOR_API_KEY = 'LIVDSRZULELA';
const TENOR_BASE = 'https://api.tenor.com/v1';

const CATEGORIES = ['Trending', 'Reactions', 'Love', 'Funny', 'Sad', 'Wow', 'Yes', 'No', 'OMG', 'Dance'];

interface GifResult {
  id: string;
  url: string;
  preview: string;
  title: string;
  width: number;
  height: number;
}

interface GifPickerProps {
  onSelect: (gifUrl: string) => void;
  onClose: () => void;
}

export const GifPicker: React.FC<GifPickerProps> = ({ onSelect, onClose }) => {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('Trending');
  const [gifs, setGifs] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchGifs = useCallback(async (searchQuery: string) => {
    setLoading(true);
    setError('');
    try {
      const q = searchQuery.trim() || (activeCategory === 'Trending' ? '' : activeCategory);
      const endpoint = q
        ? `${TENOR_BASE}/search?q=${encodeURIComponent(q)}&key=${TENOR_API_KEY}&limit=30&media_filter=minimal`
        : `${TENOR_BASE}/trending?key=${TENOR_API_KEY}&limit=30&media_filter=minimal`;

      const res = await fetch(endpoint);
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();

      const results: GifResult[] = (data.results || []).map((item: any) => {
        const media = item.media?.[0] || {};
        const gif = media.gif || media.mediumgif || {};
        const tiny = media.tinygif || media.nanogif || gif;
        return {
          id: item.id,
          url: gif.url || '',
          preview: tiny.url || gif.url || '',
          title: item.title || '',
          width: gif.dims?.[0] || 200,
          height: gif.dims?.[1] || 200,
        };
      }).filter((g: GifResult) => g.url);

      setGifs(results);
      scrollRef.current?.scrollTo({ top: 0 });
    } catch {
      setError('Could not load GIFs. Check your connection.');
      setGifs([]);
    } finally {
      setLoading(false);
    }
  }, [activeCategory]);

  useEffect(() => {
    fetchGifs(query);
  }, [activeCategory]);

  useEffect(() => {
    fetchGifs('');
    setTimeout(() => inputRef.current?.focus(), 300);
  }, []);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => fetchGifs(val), 500);
  };

  const handleCategoryClick = (cat: string) => {
    setActiveCategory(cat);
    setQuery('');
  };

  // Split gifs into 2 columns for masonry
  const col1 = gifs.filter((_, i) => i % 2 === 0);
  const col2 = gifs.filter((_, i) => i % 2 === 1);

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 z-[60]"
        onClick={onClose}
      />

      {/* Sheet */}
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-[70] bg-background rounded-t-3xl border-t border-border flex flex-col"
        style={{ height: '85vh' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-border rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-1 pb-3 flex-shrink-0">
          <h3 className="font-bold text-lg">GIFs</h3>
          <button onClick={onClose} className="p-2 hover:bg-accent rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search bar */}
        <div className="px-4 pb-3 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={handleSearch}
              placeholder="Search GIFs..."
              className="w-full bg-accent rounded-2xl pl-10 pr-4 py-3 text-sm outline-none focus:ring-2 ring-primary transition-all"
            />
            {query && (
              <button onClick={() => { setQuery(''); fetchGifs(''); }} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-border rounded-full">
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>

        {/* Category chips */}
        {!query && (
          <div className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-hide flex-shrink-0">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => handleCategoryClick(cat)}
                className={cn(
                  'flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-all border',
                  activeCategory === cat
                    ? 'bg-primary text-primary-foreground border-transparent'
                    : 'bg-accent/50 text-muted-foreground border-border hover:bg-accent'
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* GIF Grid */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 pb-8">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="w-7 h-7 animate-spin text-primary" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3">
              <p className="text-muted-foreground text-sm">{error}</p>
              <button onClick={() => fetchGifs(query)} className="text-sm text-primary font-semibold hover:underline">
                Retry
              </button>
            </div>
          ) : gifs.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
              No GIFs found for "{query}"
            </div>
          ) : (
            <div className="flex gap-2">
              {/* Column 1 */}
              <div className="flex-1 flex flex-col gap-2">
                {col1.map(gif => (
                  <button
                    key={gif.id}
                    onClick={() => onSelect(gif.url)}
                    className="w-full rounded-xl overflow-hidden hover:opacity-80 active:scale-95 transition-all"
                  >
                    <img
                      src={gif.preview || gif.url}
                      alt={gif.title}
                      className="w-full object-cover rounded-xl"
                      loading="lazy"
                      style={{ aspectRatio: `${gif.width}/${gif.height}` }}
                    />
                  </button>
                ))}
              </div>
              {/* Column 2 */}
              <div className="flex-1 flex flex-col gap-2">
                {col2.map(gif => (
                  <button
                    key={gif.id}
                    onClick={() => onSelect(gif.url)}
                    className="w-full rounded-xl overflow-hidden hover:opacity-80 active:scale-95 transition-all"
                  >
                    <img
                      src={gif.preview || gif.url}
                      alt={gif.title}
                      className="w-full object-cover rounded-xl"
                      loading="lazy"
                      style={{ aspectRatio: `${gif.width}/${gif.height}` }}
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border text-[10px] text-muted-foreground text-right flex-shrink-0 bg-background">
          Powered by Tenor
        </div>
      </motion.div>
    </>
  );
};
