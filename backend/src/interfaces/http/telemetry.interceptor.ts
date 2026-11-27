import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { Telemetry } from '../../domain/shared/telemetry';

/**
 * Routes jamais rapportées. Seule route sondée : /healthz (HEALTHCHECK Docker toutes les 30 s,
 * bloqué côté public par Caddy) : ni volume utile, ni durée qui ait un sens. /version : identité de release publique, sans authentification (un événement par appel amplifierait le coût). Aucun flux SSE ni
 * WebSocket, aucun moniteur d'uptime externe. Une route sondée ou ouverte longtemps s'ajoute ici,
 * avec son motif.
 */
const UNREPORTED_ROUTES = new Set(['/healthz', '/version']);

/** Route paramétrée ('/api/spaces/:spaceId/transactions'), jamais l'URL brute : ni identifiant, ni query string. */
export function routeOf(req: Request): string {
  const path = (req.route as { path?: unknown } | undefined)?.path;
  return typeof path === 'string' ? `${req.baseUrl}${path}` : 'unknown';
}

/** Rapporte chaque requête traitée par une route Nest (http_request), sans l'utilisateur. */
@Injectable()
export class TelemetryInterceptor implements NestInterceptor {
  constructor(private readonly telemetry: Telemetry) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // Un intercepteur global tourne aussi sur les handlers WebSocket : ni route ni méthode.
    if (context.getType() !== 'http') return next.handle();
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const route = routeOf(req);
    if (route === 'unknown' || UNREPORTED_ROUTES.has(route)) {
      return next.handle();
    }
    const startedAt = performance.now();
    const report = (status: number) =>
      this.telemetry.capture({
        name: 'http_request',
        properties: {
          route,
          method: req.method,
          status,
          duration_ms: Math.round(performance.now() - startedAt),
        },
      });

    return next.handle().pipe(
      tap({
        next: () => report(res.statusCode),
        // Le filtre d'exception écrit la réponse plus tard : le statut vient de l'erreur.
        error: (error: unknown) =>
          report(error instanceof HttpException ? error.getStatus() : 500),
      }),
    );
  }
}
