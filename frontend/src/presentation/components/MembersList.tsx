import { Household } from '../../domain/household';
import { formatCents } from '../../domain/money';

export function MembersList({ household, currentUserId }: { household: Household; currentUserId: string }) {
  return (
    <ul className="divide-y divide-hairline-soft">
      {household.members.map((member) => (
        <li key={member.userId} className="flex min-h-[56px] items-center justify-between gap-md py-sm">
          <span className="min-w-0">
            <span className="block truncate font-body-md text-body-md font-semibold">
              {member.name}
              {member.userId === currentUserId && <span className="font-normal text-mute"> (vous)</span>}
            </span>
            <span className="block font-body-sm text-body-sm text-mute">{member.role === 'OWNER' ? 'Propriétaire' : 'Membre'}</span>
          </span>
          <span className="tabular shrink-0 font-body-sm text-body-sm">
            {member.netMonthlyIncomeCents === null ? (
              <span className="text-mute">Revenu non renseigné</span>
            ) : (
              <>
                <span className="font-semibold">{formatCents(member.netMonthlyIncomeCents)}</span>
                <span className="text-mute"> / mois</span>
              </>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
