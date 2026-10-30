import { createContext, ReactNode, useContext, useMemo, useState } from 'react';
import { currentMonth } from '../domain/month';

interface SelectedMonthValue {
  month: string;
  setMonth: (month: string) => void;
}

const SelectedMonthContext = createContext<SelectedMonthValue | null>(null);

export function SelectedMonthProvider({ children, initialMonth }: { children: ReactNode; initialMonth?: string }) {
  const [month, setMonth] = useState(() => initialMonth ?? currentMonth());
  const value = useMemo(() => ({ month, setMonth }), [month]);
  return <SelectedMonthContext.Provider value={value}>{children}</SelectedMonthContext.Provider>;
}

export function useSelectedMonth(): SelectedMonthValue {
  const context = useContext(SelectedMonthContext);
  if (!context) {
    throw new Error('useSelectedMonth must be used within a SelectedMonthProvider');
  }
  return context;
}
