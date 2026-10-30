import { Controller, Get, NotFoundException, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { User } from '../../../domain/user/user';
import { UserRepository } from '../../../domain/user/user.repository';
import { resolveAuthMode } from '../../../infrastructure/auth/auth-mode';
import {
  DEV_USERS,
  signDevAccessToken,
} from '../../../infrastructure/auth/dev-auth';
import { Public } from '../decorators/public.decorator';
import { ACCESS_TOKEN_COOKIE_NAME } from '../guards/jwt-auth.guard';

@Controller('auth')
export class AuthConfigController {
  constructor(
    private readonly config: ConfigService,
    private readonly users: UserRepository,
  ) {}

  @Public()
  @Get('config')
  getConfig() {
    return resolveAuthMode(this.config) === 'dev'
      ? { mode: 'dev', devUsers: DEV_USERS }
      : { mode: 'oauth' };
  }

  /** Connexion factice (AUTH_MODE=dev uniquement) : pose un cookie signe localement. */
  @Public()
  @Get('dev-login')
  async devLogin(
    @Query('as') as: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (
      resolveAuthMode(this.config) !== 'dev' ||
      !as ||
      !DEV_USERS.includes(as)
    ) {
      throw new NotFoundException();
    }

    const id = `dev-${as}`;
    const existing = await this.users.findById(id);
    const user =
      existing ??
      User.create({
        id,
        email: `${as}@example.test`,
        name: as.charAt(0).toUpperCase() + as.slice(1),
        avatarUrl: '',
        createdAt: new Date(),
      });
    await this.users.save(user);

    const { token, expiresIn } = await signDevAccessToken(this.config, {
      id: user.id,
      email: user.email,
      name: user.name,
    });
    res.cookie(ACCESS_TOKEN_COOKIE_NAME, token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: expiresIn * 1000,
    });
    res.redirect('/');
  }
}
