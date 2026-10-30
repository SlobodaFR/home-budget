import { Body, Controller, Get, HttpCode, Put } from '@nestjs/common';
import {
  GetFiscalProfileUseCase,
  SaveFiscalProfileUseCase,
} from '../../../application/aid/aid.use-cases';
import {
  GetSafetyNetUseCase,
  SaveSafetyNetUseCase,
} from '../../../application/safety-net/safety-net.use-cases';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../decorators/current-user.decorator';
import { SaveFiscalProfileDto, SaveSafetyNetDto } from '../dto/guidance.dto';

/** Épargne de sécurité et profil fiscal : rattachés au foyer, modifiables par tous les membres. */
@Controller('household')
export class HouseholdGuidanceController {
  constructor(
    private readonly getSafetyNet: GetSafetyNetUseCase,
    private readonly saveSafetyNet: SaveSafetyNetUseCase,
    private readonly getFiscalProfile: GetFiscalProfileUseCase,
    private readonly saveFiscalProfile: SaveFiscalProfileUseCase,
  ) {}

  @Get('safety-net')
  safetyNet(@CurrentUser() user: CurrentUserPayload) {
    return this.getSafetyNet.execute(user.id);
  }

  @Put('safety-net')
  @HttpCode(204)
  updateSafetyNet(
    @Body() dto: SaveSafetyNetDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.saveSafetyNet.execute(user.id, dto);
  }

  @Get('fiscal-profile')
  fiscalProfile(@CurrentUser() user: CurrentUserPayload) {
    return this.getFiscalProfile.execute(user.id);
  }

  @Put('fiscal-profile')
  @HttpCode(204)
  updateFiscalProfile(
    @Body() dto: SaveFiscalProfileDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.saveFiscalProfile.execute(user.id, dto);
  }
}
