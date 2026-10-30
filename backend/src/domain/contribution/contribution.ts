import { ContributionMode } from '../household/household';

export interface MemberIncome {
  userId: string;
  incomeCents: number;
}

export interface ContributionResult {
  shares: { userId: string; contributionCents: number }[];
  /** Part du besoin que les revenus cumules ne peuvent pas couvrir. */
  shortfallCents: number;
}

/**
 * Part de chacun dans le budget de l'espace commun.
 * - EQUAL : parts egales (plafonnees au revenu de chacun).
 * - PROPORTIONAL : au prorata des revenus.
 * - EQUAL_REMAINDER : chacun garde le meme reste apres contribution.
 * Les montants sont des centimes entiers dont la somme est exactement le besoin
 * (methode du plus fort reste) ; personne ne contribue au-dela de son revenu.
 */
export function computeContributions(
  mode: ContributionMode,
  commonNeedCents: number,
  members: MemberIncome[],
): ContributionResult {
  const ids = members.map((m) => m.userId);
  const incomes = members.map((m) => Math.max(0, m.incomeCents));
  const totalIncome = incomes.reduce((a, b) => a + b, 0);
  const need = Math.max(0, commonNeedCents);

  if (members.length === 0) {
    return { shares: [], shortfallCents: need };
  }

  if (need === 0) {
    return { shares: zeroShares(ids), shortfallCents: 0 };
  }

  if (need >= totalIncome) {
    return {
      shares: ids.map((userId, i) => ({
        userId,
        contributionCents: incomes[i],
      })),
      shortfallCents: need - totalIncome,
    };
  }

  let real: number[];
  if (mode === 'EQUAL_REMAINDER') {
    real = equalRemainder(need, incomes);
  } else {
    const weights = mode === 'EQUAL' ? incomes.map(() => 1) : incomes;
    real = distributeWithCaps(need, weights, incomes);
  }

  const cents = largestRemainder(need, real);
  return {
    shares: ids.map((userId, i) => ({ userId, contributionCents: cents[i] })),
    shortfallCents: 0,
  };
}

function zeroShares(ids: string[]) {
  return ids.map((userId) => ({ userId, contributionCents: 0 }));
}

/** Repartit `need` selon des poids, sans depasser les plafonds (redistribue l'exces). */
function distributeWithCaps(
  need: number,
  weights: number[],
  caps: number[],
): number[] {
  const alloc = caps.map(() => 0);
  let active = caps
    .map((_, i) => i)
    .filter((i) => weights[i] > 0 && caps[i] > 0);
  let remaining = need;

  while (active.length > 0 && remaining > 1e-9) {
    const totalWeight = active.reduce((sum, i) => sum + weights[i], 0);
    const saturated = active.filter(
      (i) => (remaining * weights[i]) / totalWeight > caps[i] - alloc[i] + 1e-9,
    );
    if (saturated.length === 0) {
      for (const i of active) {
        alloc[i] += (remaining * weights[i]) / totalWeight;
      }
      remaining = 0;
      break;
    }
    for (const i of saturated) {
      remaining -= caps[i] - alloc[i];
      alloc[i] = caps[i];
    }
    active = active.filter((i) => !saturated.includes(i));
  }

  return alloc;
}

/** Contribution_i = max(0, revenu_i - R), avec R tel que la somme vaille `need`. */
function equalRemainder(need: number, incomes: number[]): number[] {
  const order = incomes
    .map((income, index) => ({ income, index }))
    .sort((a, b) => b.income - a.income);

  let prefix = 0;
  for (let k = 1; k <= order.length; k++) {
    prefix += order[k - 1].income;
    const remainder = (prefix - need) / k;
    const nextIncome = k < order.length ? order[k].income : -Infinity;
    if (remainder >= nextIncome && remainder <= order[k - 1].income) {
      const result = incomes.map(() => 0);
      for (let j = 0; j < k; j++) {
        result[order[j].index] = order[j].income - remainder;
      }
      return result;
    }
  }
  return incomes.map(() => 0);
}

/** Arrondit au centime en conservant exactement la somme `total`. */
function largestRemainder(total: number, real: number[]): number[] {
  const floors = real.map((value) => Math.floor(value + 1e-9));
  let missing = total - floors.reduce((a, b) => a + b, 0);
  const byFraction = real
    .map((value, index) => ({
      index,
      fraction: value - Math.floor(value + 1e-9),
    }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (const { index } of byFraction) {
    if (missing <= 0) break;
    floors[index] += 1;
    missing -= 1;
  }
  return floors;
}
