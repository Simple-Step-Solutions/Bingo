import React, { useState } from 'react';
import { Search, MapPin, Loader2 } from 'lucide-react';

interface AddressSearchProps {
  onSelect: (lat: number, lng: number, address: string) => void;
}

export const AddressSearch: React.FC<AddressSearchProps> = ({ onSelect }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const searchAddress = async () => {
    if (!query) return;
    setLoading(true);
    setHasSearched(true);
    try {
      // Broader search with country code filter to ensure results are found
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query)}&countrycodes=us&limit=10`, {
        headers: {
          'User-Agent': 'ChamberBingoApp_V1_Logan'
        }
      });
      
      if (!response.ok) {
        throw new Error('Search service unavailable');
      }
      
      const data = await response.json();
      console.log('Search results:', data);
      setResults(data);
    } catch (error) {
      console.error('Error searching address:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative w-full">
      <div className="flex gap-2 mb-2">
        <div className="relative flex-1">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHasSearched(false);
              setResults([]);
            }}
            onKeyDown={(e) => e.key === 'Enter' && searchAddress()}
            placeholder="Search address or location..."
            className="w-full bg-neutral-100 border-none rounded-xl py-3 pl-10 pr-4 text-sm text-neutral-900 focus:ring-2 focus:ring-neutral-900 transition-all"
          />
        </div>
        <button
          onClick={searchAddress}
          disabled={loading}
          className="bg-neutral-900 text-white px-4 rounded-xl hover:bg-neutral-800 transition-all disabled:opacity-50"
        >
          {loading ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
        </button>
      </div>

      {results.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 bg-white border border-neutral-200 rounded-2xl shadow-xl mt-2 overflow-hidden max-h-60 overflow-y-auto text-neutral-900">
          {results.map((result, idx) => (
            <button
              key={idx}
              onClick={() => {
                onSelect(parseFloat(result.lat), parseFloat(result.lon), result.display_name);
                setResults([]);
                setQuery(result.display_name);
                setHasSearched(false);
              }}
              className="w-full text-left px-4 py-3 text-sm hover:bg-neutral-50 border-b border-neutral-100 last:border-none transition-colors"
            >
              <p className="font-medium truncate">{result.display_name}</p>
            </button>
          ))}
        </div>
      )}
      
      {!loading && query && hasSearched && results.length === 0 && (
        <div className="absolute top-full left-0 right-0 z-50 bg-white border border-neutral-200 rounded-2xl shadow-xl mt-2 p-4 text-center text-xs text-neutral-900 italic">
          No locations found. Try a more specific search.
        </div>
      )}
    </div>
  );
};
