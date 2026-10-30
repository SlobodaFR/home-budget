import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Profil fiscal du foyer (plafonds des aides) : une ligne par foyer. */
@Entity({ name: 'household_fiscal_profiles' })
export class HouseholdFiscalProfileOrmEntity {
  @PrimaryColumn({ type: 'text', name: 'household_id' })
  householdId!: string;

  @Column({ type: 'integer', name: 'children_under_six' })
  childrenUnderSix!: number;

  @Column({ type: 'integer', name: 'dependent_children' })
  dependentChildren!: number;

  @Column({ type: 'boolean', name: 'first_year_home_services' })
  firstYearHomeServices!: boolean;
}
