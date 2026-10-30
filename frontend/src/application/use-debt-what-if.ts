import { useCallback, useEffect, useRef, useState } from 'react';
import { WhatIfQuery, WhatIfResult } from '../domain/debt';
import { apiClient } from '../infrastructure/api-client';

export type WhatIfState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; result: WhatIfResult; query: WhatIfQuery }
  | { status: 'error'; error: unknown; query: WhatIfQuery };

/**
 * Le simulateur d'un crédit : on lance la simulation à la demande (bouton « Simuler »), pas à chaque frappe.
 * Une réponse qui arrive après un changement de crédit, de montants ou une remise à zéro est ignorée.
 */
export function useDebtWhatIf(spaceId: string, debtId: string) {
  const [state, setState] = useState<WhatIfState>({ status: 'idle' });
  const ticket = useRef(0);

  useEffect(() => {
    ticket.current += 1;
    setState({ status: 'idle' });
  }, [spaceId, debtId]);

  const run = useCallback(
    async (query: WhatIfQuery) => {
      const mine = ++ticket.current;
      setState({ status: 'loading' });
      try {
        const result = await apiClient.fetchDebtWhatIf(spaceId, debtId, query);
        if (mine === ticket.current) {
          setState({ status: 'ready', result, query });
        }
      } catch (error) {
        if (mine === ticket.current) {
          setState({ status: 'error', error, query });
        }
      }
    },
    [spaceId, debtId],
  );

  const reset = useCallback(() => {
    ticket.current += 1;
    setState({ status: 'idle' });
  }, []);

  return { state, run, reset };
}
