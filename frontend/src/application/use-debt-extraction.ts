import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_MAX_FILE_BYTES,
  describeExtractionFailure,
  describeFailedJob,
  EMPTY_RESULT_MESSAGE,
  ExtractionCapabilities,
  ExtractionHttpFailure,
  ExtractionResult,
  ExtractionStage,
  ExtractionStatus,
  EXPIRED_MESSAGE,
  MAX_FOLLOW_MS,
  MAX_POLL_NETWORK_FAILURES,
  nextPollDelayMs,
  FIRST_POLL_DELAY_MS,
} from '../domain/debt-extraction';
import {
  ApiError,
  apiClient,
  NetworkError,
} from '../infrastructure/api-client';

/** Le bouton d'import n'est proposé que si le serveur sait lire les contrats ; toute erreur (réseau comprise) le masque. */
export function useExtractionCapabilities(
  enabled: boolean,
): ExtractionCapabilities | null {
  const [capabilities, setCapabilities] =
    useState<ExtractionCapabilities | null>(null);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    let cancelled = false;
    (async () => apiClient.fetchDebtExtractionCapabilities())().then(
      (value) => {
        if (!cancelled) {
          setCapabilities(value.available ? value : null);
        }
      },
      () => {
        if (!cancelled) {
          setCapabilities(null);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return enabled ? capabilities : null;
}

export type ImportState =
  | { phase: 'idle' }
  | { phase: 'uploading' }
  | {
      phase: 'running';
      status: ExtractionStatus;
      stage: ExtractionStage | null;
      progressPercent: number;
      connectionLost: boolean;
    }
  | { phase: 'review'; result: ExtractionResult }
  /** `canResume` : le travail existe peut-être encore côté serveur (coupure réseau) ; on peut reprendre le suivi. */
  | { phase: 'error'; message: string; canResume: boolean };

export interface DebtExtraction {
  state: ImportState;
  /** Envoie le fichier et suit le travail jusqu'au résultat. */
  start: (file: File) => void;
  /** Arrête le suivi, efface le résultat côté serveur et revient au début. */
  cancel: () => void;
  /** Comme `cancel`, mais pour quand le résultat a été repris dans le formulaire (ou abandonné après relecture). */
  release: () => void;
  /** Reprend le suivi après une coupure réseau. */
  resume: () => void;
}

interface ActiveJob {
  id: string;
  deadlineMs: number;
}

const failureOf = (error: unknown): ExtractionHttpFailure | null =>
  error instanceof NetworkError
    ? { kind: 'network' }
    : error instanceof ApiError
      ? { kind: 'http', status: error.status }
      : null;

/** Un échec qui peut passer tout seul : réseau, serveur indisponible ou en erreur. */
const isTransient = (failure: ExtractionHttpFailure | null): boolean =>
  failure !== null && (failure.kind === 'network' || failure.status >= 500);

/**
 * L'envoi d'un contrat et le suivi de sa lecture. Garanties :
 * - le fichier n'est jamais gardé (il n'est lu que par `fetch`) et le résultat ne vit que dans l'état du composant ;
 * - le résultat est effacé côté serveur (`DELETE`) dès qu'on le relâche, qu'on annule, qu'une erreur survient ou que le composant
 *   disparaît, y compris quand l'annulation arrive pendant l'envoi ;
 * - plus aucun minuteur ne tourne une fois le composant démonté.
 */
export function useDebtExtraction(
  spaceId: string,
  maxFileBytes: number = DEFAULT_MAX_FILE_BYTES,
): DebtExtraction {
  const [state, setState] = useState<ImportState>({ phase: 'idle' });
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const job = useRef<ActiveJob | null>(null);
  const active = useRef(false);
  const maxBytes = useRef(maxFileBytes);
  maxBytes.current = maxFileBytes;

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  /** `DELETE` du résultat côté serveur, une seule fois par travail ; une erreur ici n'est pas gênante (il expire seul). */
  const deleteJob = useCallback(() => {
    const current = job.current;
    job.current = null;
    if (current) {
      deleteQuietly(current.id);
    }
  }, []);

  const fail = useCallback((message: string, canResume = false) => {
    active.current = false;
    setState({ phase: 'error', message, canResume });
  }, []);

  const poll = useCallback(
    async (id: string, gen: number, attempt: number, failures: number) => {
      try {
        const reading = await apiClient.fetchDebtExtraction(id);
        if (gen !== generation.current) {
          return;
        }
        if (reading.status === 'DONE') {
          if (!reading.result) {
            deleteJob();
            fail(EMPTY_RESULT_MESSAGE);
            return;
          }
          active.current = false;
          setState({ phase: 'review', result: reading.result });
          return;
        }
        if (reading.status === 'FAILED') {
          deleteJob();
          fail(describeFailedJob(reading));
          return;
        }
        setState({
          phase: 'running',
          status: reading.status,
          stage: reading.stage,
          progressPercent: reading.progressPercent,
          connectionLost: false,
        });
        scheduleNext(id, gen, attempt + 1, 0);
      } catch (error) {
        if (gen !== generation.current) {
          return;
        }
        const failure = failureOf(error);
        if (failure?.kind === 'http' && failure.status === 404) {
          job.current = null;
          fail(EXPIRED_MESSAGE);
          return;
        }
        if (isTransient(failure) && failures + 1 < MAX_POLL_NETWORK_FAILURES) {
          setState((previous) =>
            previous.phase === 'running'
              ? { ...previous, connectionLost: true }
              : previous,
          );
          scheduleNext(id, gen, attempt + 1, failures + 1);
          return;
        }
        // Coupure durable : le travail existe peut-être encore, on laisse l'utilisateur reprendre ou annuler.
        fail(
          describeExtractionFailure(
            failure ?? { kind: 'http', status: 0 },
            'poll',
            maxBytes.current,
          ),
          isTransient(failure),
        );
      }
    },
    // `scheduleNext` et `poll` se référencent l'un l'autre : on passe par la ref ci-dessous.
    // oxlint-disable-next-line react/exhaustive-deps -- `scheduleNext` et `poll` se référencent l'un l'autre via la ref ci-dessus
    [deleteJob, fail],
  );

  const pollRef = useRef(poll);
  pollRef.current = poll;

  function scheduleNext(
    id: string,
    gen: number,
    attempt: number,
    failures: number,
  ) {
    clearTimer();
    if (job.current && Date.now() > job.current.deadlineMs) {
      deleteJob();
      fail(EXPIRED_MESSAGE);
      return;
    }
    timer.current = setTimeout(
      () => {
        timer.current = null;
        void pollRef.current(id, gen, attempt, failures);
      },
      failures > 0
        ? Math.max(
            nextPollDelayMs(attempt),
            FIRST_POLL_DELAY_MS * (failures + 1),
          )
        : nextPollDelayMs(attempt),
    );
  }

  const start = useCallback(
    (file: File) => {
      if (active.current) {
        return;
      }
      active.current = true;
      clearTimer();
      const gen = ++generation.current;
      setState({ phase: 'uploading' });
      (async () => apiClient.startDebtExtraction(spaceId, file))().then(
        (started) => {
          if (gen !== generation.current) {
            // Annulé (ou démonté) pendant l'envoi : le travail existe maintenant côté serveur, on l'efface aussitôt.
            deleteQuietly(started.jobId);
            return;
          }
          job.current = {
            id: started.jobId,
            deadlineMs: started.expiresAtMs ?? Date.now() + MAX_FOLLOW_MS,
          };
          setState({
            phase: 'running',
            status: 'PENDING',
            stage: null,
            progressPercent: 0,
            connectionLost: false,
          });
          scheduleNext(started.jobId, gen, 0, 0);
        },
        (error: unknown) => {
          if (gen === generation.current) {
            fail(
              describeExtractionFailure(
                failureOf(error) ?? { kind: 'http', status: 0 },
                'start',
                maxBytes.current,
              ),
            );
          }
        },
      );
    },
    // oxlint-disable-next-line react/exhaustive-deps -- `scheduleNext` est recréée à chaque rendu et n'est lue qu'à l'appel : l'inclure referait `start` à chaque rendu
    [spaceId, clearTimer, fail],
  );

  const release = useCallback(() => {
    generation.current += 1;
    clearTimer();
    deleteJob();
    active.current = false;
    setState({ phase: 'idle' });
  }, [clearTimer, deleteJob]);

  const resume = useCallback(() => {
    const current = job.current;
    if (!current || active.current) {
      return;
    }
    active.current = true;
    const gen = ++generation.current;
    setState({
      phase: 'running',
      status: 'RUNNING',
      stage: null,
      progressPercent: 0,
      connectionLost: true,
    });
    void pollRef.current(current.id, gen, 0, 0);
  }, []);

  useEffect(
    () => () => {
      generation.current += 1;
      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      const current = job.current;
      job.current = null;
      if (current) {
        deleteQuietly(current.id);
      }
    },
    [],
  );

  return { state, start, cancel: release, release, resume };
}

function deleteQuietly(jobId: string): void {
  try {
    void Promise.resolve(apiClient.deleteDebtExtraction(jobId)).catch(
      () => undefined,
    );
  } catch {
    // Le résultat expirera de lui-même côté serveur.
  }
}
