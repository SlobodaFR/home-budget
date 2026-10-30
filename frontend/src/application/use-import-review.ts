import { useCallback, useMemo, useReducer } from 'react';
import {
  buildCommitItems,
  Choices,
  collectLearnedRules,
  computeTotals,
  findSimilarUnclassified,
  groupRows,
  ImportTarget,
  initialChoices,
  keywordsByIndex,
  PreviewRow,
} from '../domain/statement-import';

interface ReviewState {
  choices: Choices;
  learn: Record<number, string>;
}

type ReviewAction =
  | { type: 'choose'; index: number; target: ImportTarget }
  | { type: 'classify-similar'; index: number; keywords: ReadonlyMap<number, string> }
  | { type: 'learn'; index: number; keyword: string | null };

function reducer(state: ReviewState, action: ReviewAction): ReviewState {
  switch (action.type) {
    case 'choose':
      return state.choices[action.index] === action.target
        ? state
        : { ...state, choices: { ...state.choices, [action.index]: action.target } };
    case 'classify-similar': {
      const target = state.choices[action.index];
      if (!target) {
        return state;
      }
      const choices = { ...state.choices };
      for (const index of findSimilarUnclassified(action.keywords, state.choices, action.index)) {
        choices[index] = target;
      }
      return { ...state, choices };
    }
    case 'learn': {
      const learn = { ...state.learn };
      if (action.keyword === null) {
        delete learn[action.index];
      } else {
        learn[action.index] = action.keyword;
      }
      return { ...state, learn };
    }
  }
}

export function useImportReview(rows: readonly PreviewRow[]) {
  const initial = useMemo(() => initialChoices(rows), [rows]);
  const [state, dispatch] = useReducer(reducer, undefined, (): ReviewState => ({ choices: initial, learn: {} }));
  const keywords = useMemo(() => keywordsByIndex(rows), [rows]);
  const groups = useMemo(() => groupRows(rows), [rows]);
  const totals = useMemo(() => computeTotals(rows, state.choices), [rows, state.choices]);

  const choose = useCallback((index: number, target: ImportTarget) => dispatch({ type: 'choose', index, target }), []);
  const classifySimilar = useCallback(
    (index: number) => dispatch({ type: 'classify-similar', index, keywords }),
    [keywords],
  );
  const setLearn = useCallback((index: number, keyword: string | null) => dispatch({ type: 'learn', index, keyword }), []);

  const similarCount = useCallback(
    (index: number) => findSimilarUnclassified(keywords, state.choices, index).length,
    [keywords, state.choices],
  );

  const learned = useMemo(() => collectLearnedRules(rows, state.choices, state.learn), [rows, state]);
  const result = useCallback(() => ({ items: buildCommitItems(rows, state.choices), learned }), [rows, state.choices, learned]);

  return {
    initial,
    choices: state.choices,
    learn: state.learn,
    learnedCount: learned.length,
    groups,
    totals,
    choose,
    classifySimilar,
    setLearn,
    similarCount,
    result,
  };
}
