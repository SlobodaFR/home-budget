import { ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
import { describeError } from '../../application/error-message';
import { useContribution } from '../../application/use-contribution';
import { useHousehold, useRequiredHousehold } from '../../application/use-household';
import { ContributionMode, MAX_HOUSEHOLD_MEMBERS } from '../../domain/household';
import { apiClient } from '../../infrastructure/api-client';
import { useAuth } from '../auth/AuthProvider';
import { ContributionPreview } from '../components/ContributionPreview';
import { ContributionRule } from '../components/ContributionRule';
import { ErrorNotice, OfflineNotice } from '../components/ErrorNotice';
import { ExportSection } from '../components/ExportSection';
import { IncomeForm } from '../components/IncomeForm';
import { InvitationCard } from '../components/InvitationCard';
import { LoadingScreen } from '../components/LoadingScreen';
import { MembersList } from '../components/MembersList';
import { SafetyNetSection } from '../components/SafetyNetSection';
import { useToast } from '../components/Toast';
import { buttonSecondary, cardClass } from '../components/ui';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={`${cardClass} flex flex-col gap-md`}>
      <h3 className="font-label-caps text-label-caps uppercase text-mute">{title}</h3>
      {children}
    </section>
  );
}

export function FoyerPage() {
  const household = useRequiredHousehold();
  const { offline, reload } = useHousehold();
  const { user, logout } = useAuth();
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const [savingMode, setSavingMode] = useState(false);
  const { contribution, loading, error, reload: reloadContribution } = useContribution(version);

  if (offline) {
    return (
      <OfflineNotice message="Cette page a besoin d’une connexion. Vos saisies de dépenses restent possibles hors ligne depuis l’accueil." />
    );
  }

  const me = household.members.find((member) => member.userId === user?.id);

  const saveIncome = async (cents: number | null) => {
    await apiClient.updateMyIncome(cents);
    await reload();
    setVersion((value) => value + 1);
    toast.show('Revenu enregistré');
  };

  const changeMode = async (mode: ContributionMode) => {
    setSavingMode(true);
    try {
      await apiClient.updateContributionMode(mode);
      await reload();
      setVersion((value) => value + 1);
    } catch (failure) {
      toast.show(describeError(failure, 'Changement de règle impossible.'), 'error');
    } finally {
      setSavingMode(false);
    }
  };

  return (
    <>
      <div>
        <h2 className="font-heading-lg text-heading-lg">{household.name}</h2>
        <p className="font-body-sm text-body-sm text-mute">
          {household.members.length} membre{household.members.length > 1 ? 's' : ''}
        </p>
      </div>

      <Section title="Membres">
        <MembersList household={household} currentUserId={user?.id ?? ''} />
      </Section>

      <Section title="Mon revenu net mensuel">
        <IncomeForm key={me?.netMonthlyIncomeCents ?? 'none'} currentCents={me?.netMonthlyIncomeCents ?? null} onSave={saveIncome} />
      </Section>

      <Section title="Règle de contribution">
        <p className="font-body-sm text-body-sm text-mute">Comment chacun finance l’espace commun.</p>
        <ContributionRule mode={household.contributionMode} disabled={savingMode} onChange={changeMode} />
      </Section>

      <Section title="Aperçu des parts">
        {contribution ? (
          <ContributionPreview contribution={contribution} household={household} />
        ) : error ? (
          <ErrorNotice message={describeError(error, 'Impossible de calculer les parts.')} onRetry={reloadContribution} />
        ) : (
          loading && <LoadingScreen />
        )}
      </Section>

      <SafetyNetSection />

      <Section title="Aides officielles">
        <p className="font-body-sm text-body-sm text-mute">
          Crédits d’impôt sur la garde d’enfants ou le ménage à domicile, et estimation du tarif de crèche.
        </p>
        <Link to="/aides" className={`${buttonSecondary} w-full`}>
          Voir mes aides
        </Link>
      </Section>

      <Section title="Comptes bancaires">
        <p className="font-body-sm text-body-sm text-mute">
          Où circule l’argent : compte courant, livret, espèces. Ceux de l’espace que vous avez sélectionné (commun ou perso).
        </p>
        <Link to="/comptes" className={`${buttonSecondary} w-full`}>
          Voir mes comptes
        </Link>
      </Section>

      <Section title="Projets d’épargne">
        <p className="font-body-sm text-body-sm text-mute">
          Vacances, naissance, voiture, travaux : combien mettre de côté chaque mois pour y arriver. Ceux de l’espace que vous avez sélectionné (commun ou perso).
        </p>
        <Link to="/projets" className={`${buttonSecondary} w-full`}>
          Voir mes projets
        </Link>
      </Section>

      <Section title="Revue mensuelle">
        <p className="font-body-sm text-body-sm text-mute">
          Une fois par mois : regarder ce qui s’est passé, répondre à trois questions et décider une chose pour le mois suivant.
        </p>
        <Link to="/revue" className={`${buttonSecondary} w-full`}>
          Ma revue du mois
        </Link>
      </Section>

      <Section title="Mes données">
        <ExportSection />
      </Section>

      <Section title="Inviter">
        <InvitationCard full={household.members.length >= MAX_HOUSEHOLD_MEMBERS} />
      </Section>

      <button type="button" onClick={() => void logout()} className={`${buttonSecondary} w-full`}>
        Se déconnecter
      </button>
    </>
  );
}
