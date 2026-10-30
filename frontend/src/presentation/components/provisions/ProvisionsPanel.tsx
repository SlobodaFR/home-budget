import { describeError, isOfflineError } from '../../../application/error-message';
import { useProvisions } from '../../../application/use-provisions';
import { ErrorNotice, OfflineNotice } from '../ErrorNotice';
import { LoadingScreen } from '../LoadingScreen';
import { ProvisionsView } from './ProvisionsView';

interface Props {
  spaceId: string;
  /** Change quand un paiement récurrent est modifié : les provisions sont alors recalculées. */
  refreshToken: number;
  onAdd: () => void;
}

export function ProvisionsPanel({ spaceId, refreshToken, onAdd }: Props) {
  const provisions = useProvisions(spaceId, refreshToken);
  if (provisions.data) {
    return <ProvisionsView provisions={provisions.data} onAdd={onAdd} />;
  }
  if (isOfflineError(provisions.error)) {
    return <OfflineNotice message="Hors ligne : les provisions reviendront avec le réseau." onRetry={provisions.reload} />;
  }
  if (provisions.error) {
    return <ErrorNotice message={describeError(provisions.error, 'Impossible de calculer les provisions.')} onRetry={provisions.reload} />;
  }
  return <LoadingScreen />;
}
