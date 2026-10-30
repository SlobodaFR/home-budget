import { ProjectStatus, STATUS_INFO } from '../../../domain/project';
import { STATUS_STYLE } from './project-style';

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const style = STATUS_STYLE[status];
  const Icon = style.icon;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-md py-0.5 font-body-sm text-body-sm font-semibold ${style.badge}`} data-status={status}>
      <Icon width={16} height={16} />
      {STATUS_INFO[status].label}
    </span>
  );
}
