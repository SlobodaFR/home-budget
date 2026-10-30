import { lessonReference } from '../../domain/insights';

/** Renvoi vers une leçon du cours : un lien si une adresse publique est connue, sinon la simple mention. */
export function LessonLink({ lesson }: { lesson: number }) {
  const reference = lessonReference(lesson);
  return reference.href ? (
    <a
      href={reference.href}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex min-h-[44px] items-center font-body-sm text-body-sm font-semibold underline"
    >
      {reference.label}
    </a>
  ) : (
    <span className="font-body-sm text-body-sm font-semibold text-mute">{reference.label}</span>
  );
}
