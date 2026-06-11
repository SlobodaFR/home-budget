import { cpSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const source = resolve(import.meta.dirname, '../../frontend/dist');
const destination = resolve(import.meta.dirname, '../dist/public');

if (!existsSync(source)) {
  throw new Error(`Frontend build not found at ${source}. Run "npm run build --workspace=frontend" first.`);
}

cpSync(source, destination, { recursive: true });
