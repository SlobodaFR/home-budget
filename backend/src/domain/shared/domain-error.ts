/** Violation d'un invariant du domaine : traduite en 400 par la couche HTTP. */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainError';
  }
}
