import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { SERVER_TO_SERVER_KEY } from '../decorators/server-to-server.decorator';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
// Corps qu'un formulaire HTML peut envoyer d'un autre site sans requete prealable CORS.
const FORM_CONTENT_TYPES = ['application/x-www-form-urlencoded', 'text/plain'];

interface HttpRequest {
  method: string;
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Protection CSRF des mutations du front, authentifiees par cookie. SameSite=Lax n'arrete pas
 * les requetes des autres sous-domaines *.sloboda.fr (meme site) : une mutation doit venir de
 * cette origine exacte, Sec-Fetch-Site: same-origin ou, pour les navigateurs sans cet en-tete,
 * une Origin de confiance (FRONTEND_URL). Global : seules les routes @ServerToServer() y echappent.
 */
@Injectable()
export class SameOriginGuard implements CanActivate {
  private readonly trustedOrigins: Set<string>;

  constructor(
    config: ConfigService,
    private readonly reflector: Reflector,
  ) {
    const url = config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    this.trustedOrigins = new Set([new URL(url).origin]);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<HttpRequest>();
    if (SAFE_METHODS.has(request.method.toUpperCase())) return true;
    const serverToServer = this.reflector.getAllAndOverride<boolean>(
      SERVER_TO_SERVER_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (serverToServer) return true;

    const header = (name: string) => {
      const value = request.headers[name];
      return Array.isArray(value) ? value[0] : value;
    };
    const fetchSite = header('sec-fetch-site');
    const origin = header('origin');
    const sameOrigin = fetchSite
      ? fetchSite === 'same-origin'
      : origin !== undefined && this.trustedOrigins.has(origin);
    if (!sameOrigin)
      throw new ForbiddenException('Cross-origin request refused');

    const contentType = header('content-type')?.toLowerCase() ?? '';
    if (FORM_CONTENT_TYPES.some((type) => contentType.startsWith(type)))
      throw new UnsupportedMediaTypeException('Send JSON');
    return true;
  }
}
