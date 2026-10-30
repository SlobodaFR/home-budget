import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { describeError, isOfflineError } from '../../application/error-message';
import { useOnlineStatus } from '../../application/use-online-status';
import { describeReviewSaveError, useReview, useReviewActions, useReviewHistory } from '../../application/use-review';
import { useSpace } from '../../application/use-space';
import { currentMonth } from '../../domain/month';
import { clampReviewMonth, defaultReviewMonth, isOngoingMonth, MonthlyReview, REVIEW_GRACE_DAYS, ReviewAnswers, reviewToForm, ReviewPayload } from '../../domain/review';
import { ErrorNotice, OfflineNotice } from '../components/ErrorNotice';
import { ChevronLeftIcon, LockIcon } from '../components/Icons';
import { LoadingScreen } from '../components/LoadingScreen';
import { MonthPicker } from '../components/MonthPicker';
import { ReviewForm } from '../components/review/ReviewForm';
import { ReviewHistory } from '../components/review/ReviewHistory';
import { ReviewSnapshotView } from '../components/review/ReviewSnapshotView';
import { useToast } from '../components/Toast';

function StepHeading({ step, title, intro }: { step: number; title: string; intro?: string }) {
  return (
    <div>
      <p className="font-label-caps text-label-caps uppercase text-mute">Étape {step} sur 2</p>
      <h3 className="font-heading-lg text-heading-lg">{title}</h3>
      {intro && <p className="font-body-sm text-body-sm text-mute">{intro}</p>}
    </div>
  );
}

export function RevuePage() {
  const { space, kind } = useSpace();
  const toast = useToast();
  const online = useOnlineStatus();
  const now = useMemo(() => new Date(), []);
  const [version, setVersion] = useState(0);
  const [month, setMonth] = useState<string | null>(null);
  /** Textes en cours de saisie, par espace et par mois : changer de mois puis revenir ne fait rien perdre. */
  const drafts = useRef(new Map<string, ReviewAnswers>());
  const refresh = useCallback(() => setVersion((value) => value + 1), []);

  const history = useReviewHistory(space.id, version);

  // Mois proposé à l'ouverture. Pendant les premiers jours du mois, on attend l'historique pour savoir si la revue du mois
  // précédent est déjà terminée ; ensuite le choix reste figé (enregistrer une revue ne doit pas faire changer de mois).
  const waitingForHistory = now.getDate() <= REVIEW_GRACE_DAYS && history.loading;
  useEffect(() => {
    if (month === null && !waitingForHistory) {
      setMonth(defaultReviewMonth(now, history.data ?? []));
    }
  }, [month, waitingForHistory, history.data, now]);

  const review = useReview(space.id, month, version);
  const actions = useReviewActions(space.id, month ?? currentMonth(now), refresh);

  const offline = isOfflineError(review.error);
  const retry = () => {
    review.reload();
    history.reload();
  };

  useEffect(() => {
    if (!offline) {
      return undefined;
    }
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  });

  const handleMonth = (next: string) => setMonth(clampReviewMonth(next, now));

  const handleSave = async (payload: ReviewPayload, wasDone: boolean) => {
    try {
      await actions.save(payload);
    } catch (error) {
      throw new Error(describeReviewSaveError(error));
    }
    toast.show(!payload.complete ? 'Brouillon enregistré' : wasDone ? 'Revue modifiée' : 'Revue terminée, bravo !');
  };

  const draftKey = `${space.id}:${month ?? ''}`;
  const renderReview = (data: MonthlyReview) => (
    <>
      <section aria-labelledby="revue-etape-1" className="flex flex-col gap-gutter">
        <div id="revue-etape-1">
          <StepHeading step={1} title="Où en êtes-vous ?" intro="Voici ce qui s’est passé ce mois-ci, sans jargon." />
        </div>
        <ReviewSnapshotView snapshot={data.snapshot} ongoing={isOngoingMonth(data.month, now)} />
      </section>

      <section aria-labelledby="revue-etape-2" className="flex flex-col gap-gutter">
        <div id="revue-etape-2">
          <StepHeading
            step={2}
            title="Trois questions"
            intro="Quelques mots suffisent. Vous pouvez enregistrer un brouillon et finir plus tard."
          />
        </div>
        <ReviewForm
          key={draftKey}
          review={data}
          initialValues={drafts.current.get(draftKey) ?? reviewToForm(data)}
          offline={!online}
          onChange={(values) => drafts.current.set(draftKey, values)}
          onSave={(payload) => handleSave(payload, data.status === 'DONE')}
        />
      </section>
    </>
  );

  return (
    <>
      <div>
        <Link to="/" className="-ml-2 inline-flex min-h-[44px] items-center gap-1 px-2 font-body-sm text-body-sm font-semibold">
          <ChevronLeftIcon width={18} height={18} />
          Accueil
        </Link>
        <h2 className="font-heading-lg text-heading-lg">Ma revue du mois</h2>
        <p className="font-body-sm text-body-sm text-mute">
          Une fois par mois : on regarde ce qui s’est passé, on répond à trois questions et on décide <span className="font-semibold">une</span> chose pour le mois
          suivant. Espace « {space.name} ».
        </p>
        {kind === 'PERSONAL' && (
          <p className="mt-1 flex items-center gap-sm font-body-sm text-body-sm text-mute">
            <LockIcon width={16} height={16} className="shrink-0" />
            Cette revue est privée : vous seul la voyez.
          </p>
        )}
      </div>

      {month === null ? (
        <LoadingScreen />
      ) : (
        <>
          <MonthPicker month={month} onChange={handleMonth} maxMonth={currentMonth(now)} />

          {review.data ? (
            renderReview(review.data)
          ) : offline ? (
            <OfflineNotice message="Hors ligne : votre revue reviendra avec le réseau. Ce que vous avez déjà enregistré n’est pas perdu." onRetry={retry} />
          ) : review.error ? (
            <ErrorNotice message={describeError(review.error, 'Impossible de charger la revue de ce mois.')} onRetry={review.reload} />
          ) : (
            <LoadingScreen />
          )}

          {history.data ? (
            <ReviewHistory items={history.data} currentMonth={month} onOpen={handleMonth} />
          ) : history.error ? (
            isOfflineError(history.error) ? (
              <OfflineNotice message="Hors ligne : l’historique de vos revues reviendra avec le réseau." onRetry={history.reload} />
            ) : (
              <ErrorNotice message={describeError(history.error, 'Impossible de charger l’historique des revues.')} onRetry={history.reload} />
            )
          ) : null}
        </>
      )}
    </>
  );
}
