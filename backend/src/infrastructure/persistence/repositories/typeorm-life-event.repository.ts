import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { LifeEventType } from '../../../domain/life-event/catalog';
import { LifeEvent } from '../../../domain/life-event/life-event';
import { LifeEventRepository } from '../../../domain/life-event/life-event.repository';
import { LifeEventStepOrmEntity } from '../entities/life-event-step.orm-entity';
import { LifeEventOrmEntity } from '../entities/life-event.orm-entity';

@Injectable()
export class TypeOrmLifeEventRepository extends LifeEventRepository {
  constructor(
    @InjectRepository(LifeEventOrmEntity)
    private readonly events: Repository<LifeEventOrmEntity>,
    @InjectRepository(LifeEventStepOrmEntity)
    private readonly steps: Repository<LifeEventStepOrmEntity>,
  ) {
    super();
  }

  async findByHousehold(householdId: string): Promise<LifeEvent[]> {
    const rows = await this.events
      .createQueryBuilder('e')
      .where('e.household_id = :householdId', { householdId })
      .orderBy('e.event_date', 'DESC')
      .addOrderBy('e.created_at', 'DESC')
      .addOrderBy('e.id', 'DESC')
      .getMany();
    if (rows.length === 0) {
      return [];
    }
    const stepRows = await this.steps.find({
      where: { eventId: In(rows.map((r) => r.id)) },
    });
    return rows.map((row) =>
      this.toDomain(
        row,
        stepRows.filter((s) => s.eventId === row.id),
      ),
    );
  }

  async findById(id: string): Promise<LifeEvent | null> {
    const row = await this.events.findOne({ where: { id } });
    if (!row) {
      return null;
    }
    return this.toDomain(
      row,
      await this.steps.find({ where: { eventId: id } }),
    );
  }

  async save(event: LifeEvent): Promise<void> {
    await this.events.manager.transaction(async (manager) => {
      await manager.save(LifeEventOrmEntity, {
        id: event.id,
        householdId: event.householdId,
        type: event.type,
        label: event.label,
        eventDate: event.eventDate,
        createdAt: event.createdAt.toISOString(),
      });
      await manager.delete(LifeEventStepOrmEntity, { eventId: event.id });
      if (event.progress.length > 0) {
        await manager.save(
          LifeEventStepOrmEntity,
          event.progress.map((p) => ({
            eventId: event.id,
            stepId: p.stepId,
            doneAt: p.doneAt ? p.doneAt.toISOString() : null,
            note: p.note,
          })),
        );
      }
    });
  }

  async delete(id: string): Promise<void> {
    await this.events.manager.transaction(async (manager) => {
      await manager.delete(LifeEventStepOrmEntity, { eventId: id });
      await manager.delete(LifeEventOrmEntity, { id });
    });
  }

  private toDomain(
    row: LifeEventOrmEntity,
    stepRows: LifeEventStepOrmEntity[],
  ): LifeEvent {
    return LifeEvent.create({
      id: row.id,
      householdId: row.householdId,
      type: row.type as LifeEventType,
      label: row.label,
      eventDate: row.eventDate,
      createdAt: new Date(row.createdAt),
      progress: stepRows.map((s) => ({
        stepId: s.stepId,
        doneAt: s.doneAt ? new Date(s.doneAt) : null,
        note: s.note,
      })),
    });
  }
}
