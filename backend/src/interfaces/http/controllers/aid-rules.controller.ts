import { Controller, Get, Query } from '@nestjs/common';
import {
  EstimateCrecheUseCase,
  ListAidRulesUseCase,
} from '../../../application/aid/aid.use-cases';
import { CrecheEstimateQueryDto } from '../dto/guidance.dto';

/** Catalogue des aides officielles et estimateur de crèche (authentifiés, sans données du foyer). */
@Controller('aid-rules')
export class AidRulesController {
  constructor(
    private readonly listRules: ListAidRulesUseCase,
    private readonly estimateCreche: EstimateCrecheUseCase,
  ) {}

  @Get()
  rules() {
    return this.listRules.execute();
  }

  @Get('creche-estimate')
  creche(@Query() query: CrecheEstimateQueryDto) {
    return this.estimateCreche.execute({
      annualResourcesCents: query.annualResourcesCents,
      children: query.children,
      hoursPerMonth: query.hoursPerMonth,
      kind: query.kind,
    });
  }
}
