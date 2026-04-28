// A service-style class whose constructor initializes private fields one by
// one with `this.field = expr` lines — the dominant non-literal assignment
// shape. Demonstrates that each line lands as its own site, with the
// constructor's parameters flowing through the resolved signature.

interface Logger {
  log(msg: string): void;
}

interface Repository {
  find(id: string): unknown;
}

export class OrderService {
  logger: Logger;
  repository: Repository;
  defaultLimit: number;

  constructor(logger: Logger, repository: Repository, limit: number) {
    this.logger = logger;
    this.repository = repository;
    this.defaultLimit = limit;
  }
}
