export class HerdrRuntimeError extends Error {
  readonly code?: string;

  constructor(message: string, options: { code?: string } = {}) {
    super(message);
    this.name = "HerdrRuntimeError";
    this.code = options.code;
  }
}
