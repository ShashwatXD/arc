export class ArcError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ArcError";
  }
}

export class NotFoundError extends ArcError {
  constructor(entity: string, id: string) {
    super(`${entity} not found: ${id}`, "not_found", 404);
  }
}

export class ConfigError extends ArcError {
  constructor(message: string) {
    super(message, "config", 503);
  }
}
