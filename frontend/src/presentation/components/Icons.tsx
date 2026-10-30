import { ReactNode, SVGProps } from 'react';

function Icon({ children, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

type IconProps = SVGProps<SVGSVGElement>;

export const HomeIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 11l9-8 9 8" />
    <path d="M5 10v10h14V10" />
    <path d="M10 20v-6h4v6" />
  </Icon>
);

export const PlanIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 6h16M4 12h16M4 18h16" />
    <circle cx="9" cy="6" r="2" fill="currentColor" />
    <circle cx="15" cy="12" r="2" fill="currentColor" />
    <circle cx="8" cy="18" r="2" fill="currentColor" />
  </Icon>
);

export const UsersIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
    <path d="M16 4.6a3.5 3.5 0 010 6.8" />
    <path d="M18 14.4c2.2.7 3.5 2.6 3.5 5.6" />
  </Icon>
);

export const PlusIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const CloseIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export const ChevronLeftIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M15 5l-7 7 7 7" />
  </Icon>
);

export const ChevronRightIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M9 5l7 7-7 7" />
  </Icon>
);

export const TrashIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 7h16" />
    <path d="M9 7V4h6v3" />
    <path d="M6 7l1 13h10l1-13" />
  </Icon>
);

export const LockIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 018 0v3" />
  </Icon>
);

export const ClockIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icon>
);

export const CopyIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V6a2 2 0 012-2h9" />
  </Icon>
);

export const CheckIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
);

export const WifiOffIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 3l18 18" />
    <path d="M8.5 16.4a5 5 0 017 0" />
    <path d="M5 12.9a10 10 0 014-2.4" />
    <path d="M15 10.6a10 10 0 014 2.3" />
    <path d="M12 20h.01" />
  </Icon>
);

export const ArrowUpIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Icon>
);

export const ArrowDownIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </Icon>
);

export const UploadIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 16V4M7 9l5-5 5 5" />
    <path d="M4 16v4h16v-4" />
  </Icon>
);

export const AlertIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 4l9 16H3L12 4z" />
    <path d="M12 10v4M12 17h.01" />
  </Icon>
);

export const InfoIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </Icon>
);

export const FlagIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 21V4" />
    <path d="M6 5h11l-2 4 2 4H6" />
  </Icon>
);

export const CalendarIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M4 10h16M9 3v4M15 3v4" />
  </Icon>
);

export const PencilIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 013 3L8 19l-4 1z" />
  </Icon>
);

export const BankIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 10l9-6 9 6" />
    <path d="M5 10v8M10 10v8M14 10v8M19 10v8" />
    <path d="M3 20h18" />
  </Icon>
);

export const ArchiveIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3" y="4" width="18" height="4" rx="1" />
    <path d="M5 8v11h14V8" />
    <path d="M10 12h4" />
  </Icon>
);

export const TargetIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
  </Icon>
);

export const SunIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
  </Icon>
);

export const CarIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 16V12l2-5h12l2 5v4H4z" />
    <path d="M4 12h16" />
    <circle cx="8" cy="17" r="1.6" />
    <circle cx="16" cy="17" r="1.6" />
  </Icon>
);

export const BabyIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9 10v.5M15 10v.5" />
    <path d="M9 15c1.5 1.5 4.5 1.5 6 0" />
    <path d="M12 3c-1 1.2-.5 2.5 1 2.5" />
  </Icon>
);

export const GraduationIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M2 9l10-5 10 5-10 5L2 9z" />
    <path d="M6 11.5V16c0 1.4 2.7 3 6 3s6-1.6 6-3v-4.5" />
  </Icon>
);

export const ChevronDownIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 9l6 6 6-6" />
  </Icon>
);

export const ClipboardCheckIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 4V3h6v1M9 13l2 2 4-4" />
  </Icon>
);

export const DownloadIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" />
  </Icon>
);

export const CreditCardIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 10h18M7 15h4" />
  </Icon>
);

export const ChartIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </Icon>
);

export const DocumentIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M7 3h7l5 5v13H7z" />
    <path d="M14 3v5h5M10 13h6M10 17h6" />
  </Icon>
);

export const GiftIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 10h16v10H4zM3 7h18v3H3z" />
    <path d="M12 7v13M12 7c-1-3-5-3.5-5-1.5S10.5 7 12 7zM12 7c1-3 5-3.5 5-1.5S13.5 7 12 7z" />
  </Icon>
);

export const HeartIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0112 7.3a4.3 4.3 0 017.5 2.5C19.5 15.4 12 20 12 20z" />
  </Icon>
);

export const BriefcaseIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 8h18v12H3zM9 8V5h6v3M3 13h18" />
  </Icon>
);

export const WalletIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 7a2 2 0 012-2h12v4M4 7v11a2 2 0 002 2h14V9H6a2 2 0 01-2-2z" />
    <circle cx="16" cy="14.5" r="1" fill="currentColor" />
  </Icon>
);

export const ExternalLinkIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" />
  </Icon>
);

export const HelpIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 113.5 2.3c-.7.4-1 .9-1 1.7" />
    <path d="M12 17h.01" />
  </Icon>
);

export const SearchIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </Icon>
);
