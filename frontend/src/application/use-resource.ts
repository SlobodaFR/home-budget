import { useCallback, useEffect, useState } from 'react';

interface ResourceState<T> {
  key: string;
  data?: T;
  error?: unknown;
  loading: boolean;
}

export interface Resource<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload: () => void;
}

export function useResource<T>(load: () => Promise<T>, deps: readonly unknown[], refreshToken = 0): Resource<T> {
  const key = JSON.stringify(deps);
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<ResourceState<T>>({ key, loading: true });

  useEffect(() => {
    let cancelled = false;
    setState((previous) => ({ key, data: previous.key === key ? previous.data : undefined, loading: true }));
    load().then(
      (data) => {
        if (!cancelled) {
          setState({ key, data, loading: false });
        }
      },
      (error: unknown) => {
        if (!cancelled) {
          setState((previous) => ({ key, data: previous.key === key ? previous.data : undefined, error, loading: false }));
        }
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce, refreshToken]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);
  const current = state.key === key;
  return {
    data: current ? state.data : undefined,
    error: current ? state.error : undefined,
    loading: !current || state.loading,
    reload,
  };
}
