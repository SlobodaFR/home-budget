import { WifiOffIcon } from './Icons';
import { buttonSecondary } from './ui';

interface Props {
  message: string;
  onRetry?: () => void;
}

export function ErrorNotice({ message, onRetry }: Props) {
  return (
    <div role="alert" className="flex flex-col items-start gap-md rounded border border-error/30 bg-error/5 p-gutter">
      <p className="font-body-sm text-body-sm text-error">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className={`${buttonSecondary} min-h-[44px]`}>
          Réessayer
        </button>
      )}
    </div>
  );
}

export function OfflineNotice({ message, onRetry }: Props) {
  return (
    <div role="status" className="flex flex-col items-start gap-md rounded bg-soft-cloud p-gutter">
      <p className="flex items-start gap-sm font-body-sm text-body-sm">
        <WifiOffIcon width={20} height={20} className="mt-0.5 shrink-0" />
        {message}
      </p>
      {onRetry && (
        <button type="button" onClick={onRetry} className={`${buttonSecondary} min-h-[44px] bg-white`}>
          Réessayer
        </button>
      )}
    </div>
  );
}
