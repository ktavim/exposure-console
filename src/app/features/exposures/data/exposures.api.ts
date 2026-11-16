import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ConfigurationService } from '@core/configuration.service';
import type { ExposureDetail, ExposureStatus, ExposureSummary } from '@core/models';

@Injectable({ providedIn: 'root' })
export class ExposuresApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(ConfigurationService).apiBase;

  /** The queue: open exposures, oldest submission first. */
  listQueue = (): Promise<ExposureSummary[]> =>
    firstValueFrom(this.http.get<ExposureSummary[]>(`${this.base}/exposures`));

  /** The exposures in `statuses`, newest submission first. */
  listByStatus = (statuses: readonly ExposureStatus[]): Promise<ExposureSummary[]> =>
    firstValueFrom(
      this.http.get<ExposureSummary[]>(`${this.base}/exposures`, {
        params: { status: [...statuses] }
      })
    );

  get = (id: string): Promise<ExposureDetail> =>
    firstValueFrom(this.http.get<ExposureDetail>(`${this.base}/exposures/${id}`));
}
