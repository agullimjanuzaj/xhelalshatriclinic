import { useCallback, useState } from 'react';

// Shared "Merr sugjerime" interaction pattern: button triggers a fetch
// (which may be a real backend call or a synchronous local computation —
// both are supported since the callback's return value is just awaited),
// shows a loading state while it resolves, then exposes the resulting list.
// Used identically by the "Sugjerime" page (Zgjidh simptomat) and the
// "Kontrollë e re" / "Ndrysho kontrollë" dialog (Ankesat kryesore) so the
// two never drift into separate, duplicated implementations.
export function useSuggestedConditions(fetchSuggestions: () => Promise<string[]> | string[]) {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<string[] | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetchSuggestions();
      setResults(next);
      return next;
    } finally {
      setLoading(false);
    }
  }, [fetchSuggestions]);

  const reset = useCallback(() => setResults(null), []);

  return { loading, results, fetch, reset };
}
