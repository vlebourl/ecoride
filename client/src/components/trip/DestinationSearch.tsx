import { useState, useRef } from "react";
import { X, Search, Loader2, MapPin } from "lucide-react";
import { searchPlaces } from "@/lib/nominatim";
import type { NominatimResult } from "@/lib/nominatim";
import { useT } from "@/i18n/provider";
import type { Destination } from "@/hooks/useNavigation";

interface DestinationSearchProps {
  open: boolean;
  onClose: () => void;
  onSelect: (dest: Destination) => void;
}

export function DestinationSearch({ open, onClose, onSelect }: DestinationSearchProps) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  if (!open) return null;

  const handleSearch = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!query.trim()) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsSearching(true);
    setSearchError(false);
    setHasSearched(false);

    try {
      const data = await searchPlaces(query.trim(), controller.signal);
      setResults(data);
      setHasSearched(true);
    } catch {
      if (!controller.signal.aborted) setSearchError(true);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelect = (result: NominatimResult) => {
    onSelect({ lat: result.lat, lon: result.lon, label: result.displayName });
    onClose();
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-bg" data-testid="destination-search">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-surface-container px-4 py-3">
        <form onSubmit={(e) => void handleSearch(e)} className="flex flex-1 items-center gap-2">
          <Search size={18} className="shrink-0 text-text-muted" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("trip.navigation.search.placeholder")}
            className="flex-1 bg-transparent text-base text-text outline-none placeholder:text-text-muted"
          />
          {query.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setResults([]);
                setHasSearched(false);
              }}
              className="shrink-0 text-text-muted"
            >
              <X size={16} />
            </button>
          )}
        </form>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-lg bg-surface-container px-3 py-1.5 text-sm font-medium text-text-muted"
        >
          {t("trip.navigation.clear")}
        </button>
      </div>

      {/* Search button */}
      <div className="px-4 py-3">
        <button
          type="button"
          onClick={() => void handleSearch({ preventDefault: () => {} })}
          disabled={isSearching || !query.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-bold text-bg disabled:opacity-50"
        >
          {isSearching ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              {t("trip.navigation.search.loading")}
            </>
          ) : (
            t("trip.navigation.search.button")
          )}
        </button>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {searchError && (
          <p className="px-4 py-6 text-center text-sm text-danger">
            {t("trip.navigation.search.error")}
          </p>
        )}

        {hasSearched && results.length === 0 && !searchError && (
          <p className="px-4 py-6 text-center text-sm text-text-muted">
            {t("trip.navigation.search.empty")}
          </p>
        )}

        {results.map((r, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleSelect(r)}
            className="flex w-full items-start gap-3 border-b border-surface-container px-4 py-4 text-left active:bg-surface-container"
          >
            <MapPin size={18} className="mt-0.5 shrink-0 text-primary" />
            <span className="text-sm text-text">{r.displayName}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
