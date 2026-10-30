import { ComponentType, SVGProps } from 'react';
import { DebtKind } from '../../../domain/debt';
import { BankIcon, CarIcon, CreditCardIcon, GraduationIcon, HomeIcon } from '../Icons';

export const DEBT_KIND_ICON: Record<DebtKind, ComponentType<SVGProps<SVGSVGElement>>> = {
  MORTGAGE: HomeIcon,
  CAR: CarIcon,
  CONSUMER: CreditCardIcon,
  STUDENT: GraduationIcon,
  OTHER: BankIcon,
};
