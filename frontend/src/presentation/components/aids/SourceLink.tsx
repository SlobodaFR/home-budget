import { describeVerification, safeExternalUrl, sourceHost } from '../../../domain/aids';

export function SourceLink({ url, verifiedOn }: { url: string; verifiedOn: string }) {
  const href = safeExternalUrl(url);
  return (
    <p className="font-body-sm text-body-sm text-mute">
      Source :{' '}
      {href ? (
        <a href={href} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-[44px] items-center font-semibold text-ink underline sm:min-h-0">
          {sourceHost(href)}
        </a>
      ) : (
        'non disponible'
      )}{' '}
      ({describeVerification(verifiedOn)})
    </p>
  );
}
