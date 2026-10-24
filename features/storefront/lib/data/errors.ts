export class StorefrontDataUnavailableError extends Error {
  constructor(resource: string) {
    super(`${resource} could not be loaded`);
    this.name = "StorefrontDataUnavailableError";
  }
}
