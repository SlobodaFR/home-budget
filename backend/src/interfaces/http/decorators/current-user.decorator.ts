import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedRequest, CurrentUserPayload } from '../auth-session';

export type { CurrentUserPayload };

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserPayload => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user!;
  },
);
