import { HttpErrorResponse } from '@angular/common/http';
import type { ExposureNotice, ExposureStatus } from '@core/models';

/**
 * What the backend's error responses carry, under `detail`: always a message;
 * for a 409 on an exposure, its current status and version; for a refused
 * grouping, an error per service. FastAPI's own validation errors come as a
 * list instead.
 */
export interface ApiErrorDetail {
  message: string;
  status?: ExposureStatus;
  version?: number;
  errors?: ExposureNotice[];
}

export function apiError(err: unknown): ApiErrorDetail & { httpStatus: number } {
  if (!(err instanceof HttpErrorResponse)) {
    return { message: err instanceof Error ? err.message : String(err), httpStatus: 0 };
  }
  const detail = (err.error as { detail?: unknown } | null)?.detail;
  if (Array.isArray(detail)) {
    // FastAPI: [{ loc, msg, type }]. "Value error, " is pydantic's prefix for a validator's message.
    const first = detail[0] as { msg?: string } | undefined;
    return { message: (first?.msg ?? 'invalid request').replace(/^Value error, /, ''), httpStatus: err.status };
  }
  if (detail && typeof detail === 'object' && 'message' in detail) {
    return { ...(detail as ApiErrorDetail), httpStatus: err.status };
  }
  return { message: err.status ? `${err.status} ${err.statusText}` : 'the server could not be reached', httpStatus: err.status };
}
