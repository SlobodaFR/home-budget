import { FoyerSchema1761782400000 } from './1761782400000-FoyerSchema';
import { SpaceRules1761868800000 } from './1761868800000-SpaceRules';
import { GuidagePrevisionnel1761955200000 } from './1761955200000-GuidagePrevisionnel';
import { ComptesBancaires1762041600000 } from './1762041600000-ComptesBancaires';
import { PaiementsNonMensuels1762128000000 } from './1762128000000-PaiementsNonMensuels';
import { ProjetsEpargne1762214400000 } from './1762214400000-ProjetsEpargne';
import { RevuesMensuelles1762300800000 } from './1762300800000-RevuesMensuelles';

/** Liste explicite et ordonnée : toute nouvelle migration s'ajoute ici. */
export const MIGRATIONS = [
  FoyerSchema1761782400000,
  SpaceRules1761868800000,
  GuidagePrevisionnel1761955200000,
  ComptesBancaires1762041600000,
  PaiementsNonMensuels1762128000000,
  ProjetsEpargne1762214400000,
  RevuesMensuelles1762300800000,
];
