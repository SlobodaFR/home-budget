import type { ServeStaticModuleOptions } from '@nestjs/serve-static';

/**
 * Fallback SPA : tout ce qui n'est ni une route API ni /healthz renvoie index.html.
 * Syntaxe Express 5 (path-to-regexp 8) : `{*path}` remplace l'ancien `(.*)`, et couvre aussi `/api`.
 */
export function serveStaticOptions(rootPath: string): ServeStaticModuleOptions {
  return { rootPath, exclude: ['/api/{*path}', '/healthz'] };
}
