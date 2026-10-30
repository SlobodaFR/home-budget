import { Link } from 'react-router-dom';
import { InsightsState } from '../../application/use-insights';
import { Insight, insightAction, lessonReference, SEVERITY_LABEL } from '../../domain/insights';
import { SEVERITY_STYLE } from './severity-style';
import { cardClass } from './ui';

function InsightItem({ insight }: { insight: Insight }) {
  const style = SEVERITY_STYLE[insight.severity];
  const Icon = style.icon;
  const action = insightAction(insight.link);
  const lesson = insight.lesson === null ? null : lessonReference(insight.lesson);

  return (
    <li className={`flex gap-md border-l-4 py-md pl-md ${style.accent}`}>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${style.badge}`}>
        <Icon width={20} height={20} />
        <span className="sr-only">{SEVERITY_LABEL[insight.severity]} : </span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-body-md text-body-md font-semibold">{insight.title}</p>
        {insight.detail && <p className="font-body-sm text-body-sm text-mute">{insight.detail}</p>}
        {(lesson || action) && (
          <div className="mt-sm flex flex-wrap items-center gap-x-md gap-y-sm">
            {action && (
              <Link
                to={action.to}
                className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-ink px-lg font-body-sm text-body-sm font-semibold text-surface"
              >
                {action.label}
              </Link>
            )}
            {lesson &&
              (lesson.href ? (
                <a
                  href={lesson.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex min-h-[44px] items-center font-body-sm text-body-sm font-semibold underline"
                >
                  {lesson.label}
                </a>
              ) : (
                <span className="font-body-sm text-body-sm text-mute">{lesson.label}</span>
              ))}
          </div>
        )}
      </div>
    </li>
  );
}

export function InsightsCard({ state }: { state: InsightsState }) {
  if (state.status === 'hidden') {
    return null;
  }
  return (
    <section aria-label="Prochaines actions" className={cardClass}>
      <h3 className="font-label-caps text-label-caps uppercase text-mute">Prochaines actions</h3>
      {state.status === 'loading' ? (
        <div role="status" aria-label="Chargement des conseils" className="mt-md flex flex-col gap-md">
          <div className="h-12 animate-pulse rounded bg-soft-cloud" />
          <div className="h-12 animate-pulse rounded bg-soft-cloud" />
        </div>
      ) : (
        <ul className="mt-sm divide-y divide-hairline-soft">
          {state.insights.map((insight) => (
            <InsightItem key={insight.id} insight={insight} />
          ))}
        </ul>
      )}
    </section>
  );
}
