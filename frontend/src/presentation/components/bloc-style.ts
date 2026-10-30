import { Bloc } from '../../domain/bloc';

export interface BlocStyle {
  bar: string;
  dot: string;
  text: string;
  chipOn: string;
  chipOff: string;
  ring: string;
}

export const BLOC_STYLE: Record<Bloc, BlocStyle> = {
  FIXE: {
    bar: 'bg-fixe',
    dot: 'bg-fixe',
    text: 'text-fixe',
    chipOn: 'border-fixe bg-fixe text-white',
    chipOff: 'border-fixe/40 bg-fixe/10 text-fixe',
    ring: 'focus-visible:outline-fixe',
  },
  COURANT: {
    bar: 'bg-courant',
    dot: 'bg-courant',
    text: 'text-courant',
    chipOn: 'border-courant bg-courant text-white',
    chipOff: 'border-courant/40 bg-courant/10 text-courant',
    ring: 'focus-visible:outline-courant',
  },
  PLAISIR: {
    bar: 'bg-plaisir',
    dot: 'bg-plaisir',
    text: 'text-plaisir',
    chipOn: 'border-plaisir bg-plaisir text-white',
    chipOff: 'border-plaisir/40 bg-plaisir/10 text-plaisir',
    ring: 'focus-visible:outline-plaisir',
  },
  EPARGNE: {
    bar: 'bg-epargne',
    dot: 'bg-epargne',
    text: 'text-epargne',
    chipOn: 'border-epargne bg-epargne text-white',
    chipOff: 'border-epargne/40 bg-epargne/10 text-epargne',
    ring: 'focus-visible:outline-epargne',
  },
};
