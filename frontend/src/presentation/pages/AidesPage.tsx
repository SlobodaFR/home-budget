import { ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
import { describeError } from '../../application/error-message';
import { useAids } from '../../application/use-aids';
import { useFiscalProfile } from '../../application/use-fiscal-profile';
import { useRequiredHousehold } from '../../application/use-household';
import { AIDS_DISCLAIMER, FiscalProfile } from '../../domain/aids';
import { findSpace } from '../../domain/household';
import { currentYear } from '../../domain/month';
import { AidsSummaryView } from '../components/aids/AidsSummaryView';
import { CrecheEstimator } from '../components/aids/CrecheEstimator';
import { FiscalProfileForm } from '../components/aids/FiscalProfileForm';
import { ErrorNotice } from '../components/ErrorNotice';
import { ChevronLeftIcon, ChevronRightIcon, InfoIcon } from '../components/Icons';
import { LoadingScreen } from '../components/LoadingScreen';
import { useToast } from '../components/Toast';
import { cardClass } from '../components/ui';

const stepButton = 'flex h-11 w-11 items-center justify-center rounded-full border border-hairline-soft bg-white hover:bg-soft-cloud';

function Section({ id, title, intro, children }: { id?: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section id={id} aria-label={title} className={`${cardClass} flex flex-col gap-md`}>
      <h3 className="font-label-caps text-label-caps uppercase text-mute">{title}</h3>
      {intro && <p className="font-body-sm text-body-sm text-mute">{intro}</p>}
      {children}
    </section>
  );
}

export function AidesPage() {
  const household = useRequiredHousehold();
  const commonSpace = findSpace(household, 'COMMON');
  const toast = useToast();
  const [year, setYear] = useState(() => currentYear());
  const [version, setVersion] = useState(0);
  const fiscal = useFiscalProfile();
  const aids = useAids(commonSpace?.id ?? '', year, version);

  if (!commonSpace) {
    return <p className="text-center text-mute">Les aides concernent l’espace commun, qui n’est pas disponible pour ce foyer.</p>;
  }

  const saveProfile = async (profile: FiscalProfile) => {
    try {
      await fiscal.save(profile);
      setVersion((value) => value + 1);
      toast.show('Profil fiscal enregistré');
    } catch (error) {
      toast.show(describeError(error, 'Enregistrement du profil impossible.'), 'error');
      throw error;
    }
  };

  return (
    <>
      <div>
        <Link to="/foyer" className="-ml-2 inline-flex min-h-[44px] items-center gap-1 px-2 font-body-sm text-body-sm font-semibold">
          <ChevronLeftIcon width={18} height={18} />
          Foyer
        </Link>
        <h2 className="font-heading-lg text-heading-lg">Aides officielles</h2>
        <p className="font-body-sm text-body-sm text-mute">Ce qui vous revient sur certaines dépenses de l’espace commun.</p>
      </div>

      <p className="flex items-start gap-sm rounded bg-soft-cloud p-md font-body-sm text-body-sm">
        <InfoIcon width={20} height={20} className="mt-0.5 shrink-0" />
        <span>
          <span className="font-semibold">Estimation, pas un conseil fiscal.</span> {AIDS_DISCLAIMER}
        </span>
      </p>

      <div className="flex items-center justify-between">
        <button type="button" aria-label="Année précédente" className={stepButton} onClick={() => setYear((value) => value - 1)}>
          <ChevronLeftIcon />
        </button>
        <h3 className="font-heading-lg text-heading-lg" aria-live="polite">
          {year}
        </h3>
        <button type="button" aria-label="Année suivante" className={stepButton} onClick={() => setYear((value) => value + 1)}>
          <ChevronRightIcon />
        </button>
      </div>

      {aids.data?.profileMissing && (
        <p role="status" className="rounded border border-plaisir/40 bg-plaisir/10 p-md font-body-sm text-body-sm">
          <span className="font-semibold">Votre profil fiscal n’est pas rempli.</span> Sans lui, on compte 0 enfant et les plafonds sont sous-estimés.{' '}
          <a href="#profil-fiscal" className="inline-flex min-h-[44px] items-center font-semibold underline">
            Remplir mon profil
          </a>
        </p>
      )}

      {aids.data ? (
        <AidsSummaryView summary={aids.data} />
      ) : aids.error ? (
        <ErrorNotice message={describeError(aids.error, 'Impossible de charger le récapitulatif des aides.')} onRetry={aids.reload} />
      ) : (
        <LoadingScreen />
      )}

      <Section id="profil-fiscal" title="Mon profil fiscal" intro="Il sert à calculer vos plafonds. Il est commun à tout le foyer.">
        {fiscal.error ? (
          <ErrorNotice message={describeError(fiscal.error, 'Impossible de charger le profil fiscal.')} onRetry={fiscal.reload} />
        ) : fiscal.profile === undefined ? (
          <LoadingScreen />
        ) : (
          <FiscalProfileForm key={JSON.stringify(fiscal.profile)} initial={fiscal.profile} saving={fiscal.saving} onSave={saveProfile} />
        )}
      </Section>

      <Section
        title="Estimer le tarif d’une crèche"
        intro="Pour une crèche collective ou une micro-crèche : le tarif dépend des revenus et du nombre d’enfants."
      >
        <CrecheEstimator />
      </Section>
    </>
  );
}
