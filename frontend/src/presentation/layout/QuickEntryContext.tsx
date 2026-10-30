import { createContext, useContext } from 'react';
import { Transaction } from '../../domain/budget';

export interface QuickEntryValue {
  openNew: () => void;
  openEdit: (transaction: Transaction) => void;
}

export const QuickEntryContext = createContext<QuickEntryValue>({
  openNew: () => undefined,
  openEdit: () => undefined,
});

export function useQuickEntry(): QuickEntryValue {
  return useContext(QuickEntryContext);
}
