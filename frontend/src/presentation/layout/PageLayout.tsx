import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeftIcon } from '../components/Icons';

interface PageIntroProps {
  title: string;
  /** Le texte sous le titre (une phrase ou deux). */
  description?: ReactNode;
  /** Lien de retour : utile sur mobile et tablette, où la navigation passe par l'accueil ; sur ordinateur la barre latérale suffit. */
  back?: { to: string; label: string };
  children?: ReactNode;
}

/**
 * L'en-tête du contenu d'une page : retour, titre (h2) et phrase d'explication. Sur ordinateur (≥ 1024 px), le titre de l'écran
 * est déjà l'h1 de l'en-tête de page et le retour est dans la barre latérale : il ne reste que la phrase d'explication
 * (le titre reste lu par les lecteurs d'écran, qui y trouvent l'espace concerné).
 */
export function PageIntro({
  title,
  description,
  back,
  children,
}: PageIntroProps) {
  return (
    <div className="lg:max-w-[75ch]">
      {back && (
        <Link
          to={back.to}
          className="-ml-2 inline-flex min-h-[44px] items-center gap-1 px-2 font-body-sm text-body-sm font-semibold lg:hidden"
        >
          <ChevronLeftIcon width={18} height={18} />
          {back.label}
        </Link>
      )}
      <h2 className="font-heading-lg text-heading-lg lg:sr-only">{title}</h2>
      {description && (
        <p className="font-body-sm text-body-sm text-mute lg:text-body-md">
          {description}
        </p>
      )}
      {children}
    </div>
  );
}

interface CardGridProps {
  /** Nombre de colonnes à partir de `xl` (deux dès la tablette dans tous les cas). */
  columns?: 2 | 3;
  label?: string;
  /** Une carte seule occupe toute la largeur (utile pour une carte longue, comme un événement de vie). */
  fullWidthWhenAlone?: boolean;
  children: ReactNode;
}

/** Une liste de cartes : une colonne sur mobile, deux dès la tablette, trois sur grand écran si `columns` le demande. */
export function CardGrid({
  columns = 2,
  label,
  fullWidthWhenAlone = false,
  children,
}: CardGridProps) {
  return (
    <ul
      aria-label={label}
      className={`grid grid-cols-1 gap-gutter md:grid-cols-2 lg:gap-6 ${columns === 3 ? 'xl:grid-cols-3' : ''} ${
        fullWidthWhenAlone ? 'md:[&>li:only-child]:col-span-full' : ''
      }`.trim()}
    >
      {children}
    </ul>
  );
}

interface TwoColumnsProps {
  left: ReactNode;
  right: ReactNode;
  /** `equal` : deux colonnes égales ; `aside` : la colonne de droite est une colonne latérale plus étroite. */
  ratio?: 'equal' | 'aside';
  /** Largeur d'écran à partir de laquelle on passe en deux colonnes. */
  from?: 'md' | 'lg' | 'xl';
  /** Espacement entre les deux colonnes quand elles sont empilées (mobile) : celui de la page d'origine. */
  gap?: 'gutter' | 'lg';
}

const SPLIT: Record<
  NonNullable<TwoColumnsProps['from']>,
  Record<NonNullable<TwoColumnsProps['ratio']>, string>
> = {
  md: {
    equal: 'md:grid md:grid-cols-2',
    aside:
      'md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_340px]',
  },
  lg: {
    equal: 'lg:grid lg:grid-cols-2',
    aside: 'lg:grid lg:grid-cols-[minmax(0,1fr)_340px]',
  },
  xl: {
    equal: 'xl:grid xl:grid-cols-2',
    aside: 'xl:grid xl:grid-cols-[minmax(0,1fr)_340px]',
  },
};

/**
 * Deux colonnes sur grand écran, une pile sur mobile : l'ordre du DOM (gauche puis droite) est aussi l'ordre de lecture
 * sur mobile, donc l'ordre des cartes ne change pas d'une taille à l'autre.
 */
export function TwoColumns({
  left,
  right,
  ratio = 'equal',
  from = 'xl',
  gap = 'gutter',
}: TwoColumnsProps) {
  return (
    <div
      className={`flex flex-col ${gap === 'lg' ? 'gap-lg' : 'gap-gutter'} ${SPLIT[from][ratio]} items-start md:gap-6 xl:gap-8`}
    >
      <div
        className={`flex w-full min-w-0 flex-col ${gap === 'lg' ? 'gap-lg' : 'gap-gutter'} lg:gap-6`}
      >
        {left}
      </div>
      <div
        className={`flex w-full min-w-0 flex-col ${gap === 'lg' ? 'gap-lg' : 'gap-gutter'} lg:gap-6`}
      >
        {right}
      </div>
    </div>
  );
}
