import { Request } from 'express';

/**
 * Éléments partagés par le garde JWT, le décorateur `@CurrentUser()` et les
 * cookies d'authentification : regroupés ici pour qu'aucun de ces modules
 * n'ait à importer un autre (cycle).
 */
export const ACCESS_TOKEN_COOKIE_NAME = 'access_token';
export const REFRESH_TOKEN_COOKIE_NAME = 'refresh_token';

export interface CurrentUserPayload {
  id: string;
  email: string;
  name: string;
}

export interface AuthenticatedRequest extends Request {
  cookies: Record<string, string | undefined>;
  user?: CurrentUserPayload;
}
