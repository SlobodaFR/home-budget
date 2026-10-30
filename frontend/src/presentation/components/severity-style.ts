import { ComponentType, SVGProps } from 'react';
import { InsightSeverity } from '../../domain/insights';
import { AlertIcon, CheckIcon, FlagIcon, InfoIcon } from './Icons';

export interface SeverityStyle {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Bandeau coloré à gauche + pastille de l'icône. */
  accent: string;
  badge: string;
}

export const SEVERITY_STYLE: Record<InsightSeverity, SeverityStyle> = {
  WARNING: { icon: AlertIcon, accent: 'border-l-error', badge: 'bg-error/10 text-error' },
  ACTION: { icon: FlagIcon, accent: 'border-l-plaisir', badge: 'bg-plaisir/15 text-plaisir' },
  INFO: { icon: InfoIcon, accent: 'border-l-fixe', badge: 'bg-fixe/10 text-fixe' },
  GOOD: { icon: CheckIcon, accent: 'border-l-success', badge: 'bg-success/10 text-success' },
};
