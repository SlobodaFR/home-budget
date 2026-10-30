import { ComponentType, SVGProps } from 'react';
import { StepCategory, StepStatus } from '../../../domain/life-event';
import { AlertIcon, BriefcaseIcon, CheckIcon, ClockIcon, DocumentIcon, GiftIcon, HeartIcon, CalendarIcon, FlagIcon, WalletIcon } from '../Icons';

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

/** Chaque thème a une icône ET un libellé écrit : l'icône n'est jamais seule. */
export const CATEGORY_ICON: Record<StepCategory, IconComponent> = {
  ADMIN: DocumentIcon,
  AIDES: GiftIcon,
  SANTE: HeartIcon,
  TRAVAIL: BriefcaseIcon,
  BUDGET: WalletIcon,
};

export interface StatusStyle {
  icon: IconComponent;
  /** Pastille du titre de groupe : le texte est toujours écrit, la couleur n'est qu'un renfort. */
  badge: string;
  /** Liseré à gauche de la démarche. */
  accent: string;
  /** Couleur du texte d'échéance. */
  due: string;
}

export const STATUS_STYLE: Record<StepStatus, StatusStyle> = {
  OVERDUE: { icon: AlertIcon, badge: 'bg-error/10 text-error', accent: 'border-l-error', due: 'font-semibold text-error' },
  DUE_SOON: { icon: ClockIcon, badge: 'bg-plaisir/15 text-ink', accent: 'border-l-plaisir', due: 'font-semibold text-ink' },
  UPCOMING: { icon: CalendarIcon, badge: 'bg-fixe/10 text-fixe', accent: 'border-l-fixe', due: 'text-mute' },
  NO_DATE: { icon: FlagIcon, badge: 'bg-soft-cloud text-ink', accent: 'border-l-hairline', due: 'text-mute' },
  DONE: { icon: CheckIcon, badge: 'bg-success/10 text-success', accent: 'border-l-success', due: 'text-mute' },
};
