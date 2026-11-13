import { describeError } from '../../application/error-message';
import { usePlan } from '../../application/use-plan';
import { useSpace } from '../../application/use-space';
import { Plan } from '../../domain/budget';
import { ErrorNotice } from '../components/ErrorNotice';
import { LoadingScreen } from '../components/LoadingScreen';
import { PlanForm } from '../components/PlanForm';
import { useToast } from '../components/Toast';
import { PageIntro } from '../layout/PageLayout';

export function PlanPage() {
  const { space, kind } = useSpace();
  const { plan, loading, error, saving, save, reload } = usePlan(space.id);
  const toast = useToast();

  const handleSave = async (next: Plan) => {
    try {
      await save(next);
      toast.show('Plan enregistré');
      return true;
    } catch (failure) {
      toast.show(
        describeError(failure, 'Enregistrement du plan impossible.'),
        'error',
      );
      return false;
    }
  };

  return (
    <>
      <PageIntro
        title={`Plan ${kind === 'COMMON' ? 'commun' : 'perso'}`}
        description="Le budget prévu pour un mois type."
      />
      {plan ? (
        <PlanForm
          key={space.id}
          initial={plan}
          saving={saving}
          isCommon={kind === 'COMMON'}
          onSave={handleSave}
        />
      ) : error ? (
        <ErrorNotice
          message={describeError(error, 'Impossible de charger le plan.')}
          onRetry={reload}
        />
      ) : (
        loading && <LoadingScreen />
      )}
    </>
  );
}
