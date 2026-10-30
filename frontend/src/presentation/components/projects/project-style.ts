import { ComponentType, SVGProps } from 'react';
import { ProjectKind, ProjectStatus } from '../../../domain/project';
import { AlertIcon, ArrowDownIcon, ArrowUpIcon, BabyIcon, CarIcon, CheckIcon, FlagIcon, GraduationIcon, HomeIcon, SunIcon, TargetIcon } from '../Icons';

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

export const KIND_ICON: Record<ProjectKind, IconComponent> = {
  GENERIC: TargetIcon,
  BABY: BabyIcon,
  HOLIDAY: SunIcon,
  PURCHASE: CarIcon,
  HOME: HomeIcon,
  EDUCATION: GraduationIcon,
  OTHER: TargetIcon,
};

export interface StatusStyle {
  icon: IconComponent;
  /** Pastille du statut : texte toujours présent, la couleur n'est qu'un renfort. */
  badge: string;
  /** Remplissage de la barre de progression. */
  bar: string;
}

export const STATUS_STYLE: Record<ProjectStatus, StatusStyle> = {
  DONE: { icon: FlagIcon, badge: 'bg-success/10 text-success', bar: 'bg-success' },
  AHEAD: { icon: ArrowUpIcon, badge: 'bg-success/10 text-success', bar: 'bg-success' },
  ON_TRACK: { icon: CheckIcon, badge: 'bg-fixe/10 text-fixe', bar: 'bg-fixe' },
  BEHIND: { icon: ArrowDownIcon, badge: 'bg-plaisir/15 text-ink', bar: 'bg-plaisir' },
  LATE: { icon: AlertIcon, badge: 'bg-error/10 text-error', bar: 'bg-error' },
};
