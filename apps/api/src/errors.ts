export class HttpError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function httpError(status: number, message: string, code?: string) {
  return new HttpError(status, message, code);
}
