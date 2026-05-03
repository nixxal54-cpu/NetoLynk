import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

// Using Tenor API v2 (free, no key needed for basic use - fallback to static gifs)
// For production, use GIPHY or Tenor with an API key
const TENOR_API_KEY = 'AIzaSyAyimkuYQYF_FXVALexolOsiqar4E';
const TENOR_BASE = 'https://tenor.googleapis.com/v2';

interface GifResult {
  id: string;
  url: string;
  preview: string;
  title: string;
}

interface GifPickerProps {
  onSelect: (gifUrl: string) => void;
  onClose: () => void;
}

export const GifPicker: React.FC<GifPickerProps> = ({ onSelect, onClose }) => {
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchGifs = useCallback(async (searchQuery: string) => {
    setLoading(true);
    setError('');
    try {
      const endpoint = searchQuery.trim()
        ? `${TENOR_BASE}/search?q=${encodeURIComponent(searchQuery)}&key=${TENOR_API_KEY}&limit=20&media_filter=gif`
        : `${TENOR_BASE}/featured?key=${TENOR_API_KEY}&limit=20&media_filter=gif`;

      const res = await fetch(endpoint);
      if (!res.ok) throw new Error('Failed to fetch GIFs');
      const data = await res.json();

      const results: GifResult[] = (data.results || []).map((item: any) => ({
        id: item.id,
        url: item.media_formats?.gif?.url || item.media_formats?.mediumgif?.url || '',
        preview: item.media_formats?.tinygif?.url || item.media_formats?.nanogif?.url || '',
        title: item.title || item.content_description || '',
      })).filter((g: GifResult) => g.url);

      setGifs(results);
    } catch (err) {
      setError('Could not load GIFs. Check your connection.');
      setGifs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGifs('');
    inputRef.current?.focus();
  }, []);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => fetchGifs(val), 500);
  };

  return (
    <div className="absolute bottom-full mb-2 left-0 right-0 z-50 bg-background border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: '340px' }}>
      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b border-border bg-background sticky top-0 z-10">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={handleSearch}
            placeholder="Search GIFs..."
            className="w-full bg-accent rounded-full pl-9 pr-4 py-2 text-sm outline-none focus:ring-1 ring-primary"
          />
        </div>
        <button onClick={onClose} className="p-1.5 hover:bg-accent rounded-full text-muted-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Grid */}
      <div className="overflow-y-auto flex-1 p-2">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="text-center text-muted-foreground text-sm py-8">{error}</div>
        ) : gifs.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-8">No GIFs found</div>
        ) : (
          <div className="columns-3 gap-1.5 space-y-1.5">
            {gifs.map((gif) => (
              <button
                key={gif.id}
                onClick={() => onSelect(gif.url)}
                className="w-full break-inside-avoid rounded-lg overflow-hidden hover:opacity-80 transition-opacity"
                title={gif.title}
              >
                <img
                  src={gif.preview || gif.url}
                  alt={gif.title}
                  className="w-full object-cover"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="px-3 py-1.5 border-t border-border text-[10px] text-muted-foreground text-right bg-background">
        Powered by Tenor
      </div>
    </div>
  );
};
