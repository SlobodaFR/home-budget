import { useCallback, useRef, useState } from 'react';
import { CrecheEstimate, CrecheQuery } from '../domain/aids';
import { apiClient } from '../infrastructure/api-client';

export function useCrecheEstimate() {
  const [estimate, setEstimate] = useState<CrecheEstimate | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const latest = useRef(0);

  const run = useCallback(async (query: CrecheQuery) => {
    latest.current += 1;
    const ticket = latest.current;
    setLoading(true);
    setError(null);
    try {
      const result = await apiClient.fetchCrecheEstimate(query);
      if (ticket === latest.current) {
        setEstimate(result);
      }
    } catch (failure) {
      if (ticket === latest.current) {
        setEstimate(null);
        setError(failure);
      }
    } finally {
      if (ticket === latest.current) {
        setLoading(false);
      }
    }
  }, []);

  return { estimate, error, loading, run };
}
