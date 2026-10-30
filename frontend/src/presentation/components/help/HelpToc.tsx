import { helpAnchor, HelpSection } from '../../../domain/help';

/** Le sommaire : un lien d'ancre par section affichée. */
export function HelpToc({ sections }: { sections: readonly HelpSection[] }) {
  return (
    <nav id="sommaire" aria-labelledby="sommaire-titre" className="scroll-mt-md rounded bg-soft-cloud p-gutter">
      <h2 id="sommaire-titre" className="font-label-caps text-label-caps uppercase text-ink">
        Sommaire
      </h2>
      <ol className="mt-sm flex flex-col">
        {sections.map((section, index) => (
          <li key={section.id}>
            <a href={`#${helpAnchor(section.id)}`} className="flex min-h-[44px] items-center gap-md font-body-md text-body-md font-semibold text-ink">
              <span aria-hidden="true" className="w-5 shrink-0 text-ink">
                {index + 1}.
              </span>
              <span className="underline">{section.title}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
