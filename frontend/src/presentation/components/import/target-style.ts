import { ImportTarget } from '../../../domain/statement-import';
import { BLOC_STYLE } from '../bloc-style';

export interface TargetStyle {
  chipOn: string;
  chipOff: string;
  dot: string;
}

export const TARGET_STYLE: Record<ImportTarget, TargetStyle> = {
  FIXE: BLOC_STYLE.FIXE,
  COURANT: BLOC_STYLE.COURANT,
  PLAISIR: BLOC_STYLE.PLAISIR,
  EPARGNE: BLOC_STYLE.EPARGNE,
  INCOME: {
    chipOn: 'border-success bg-success text-white',
    chipOff: 'border-success/40 bg-success/10 text-success',
    dot: 'bg-success',
  },
  IGNORE: {
    chipOn: 'border-mute bg-mute text-white',
    chipOff: 'border-hairline bg-white text-mute',
    dot: 'bg-hairline',
  },
};
