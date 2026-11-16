import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ConfigurationService } from '@core/configuration.service';
import type { ExposureDetail, ExposureStatus, ExposureSummary, PublishedOrigin } from '@core/models';

export type ExposureAction = 'plan' | 'confirm' | 'retry' | 'cancel';

/** The body of PUT /exposures/{id}/groups. */
export interface SaveGroupingBody {
  version: number;
  groups: { id?: string; service_ids: string[] }[];
}

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

  /** Replace the grouping; returns the exposure as it now stands. */
  saveGroups = (id: string, body: SaveGroupingBody): Promise<ExposureDetail> =>
    firstValueFrom(this.http.put<ExposureDetail>(`${this.base}/exposures/${id}/groups`, body));

  /** POST /exposures/{id}/{action}: plan, confirm, retry or cancel, against a version. */
  act = (id: string, action: ExposureAction, body: { version: number; plan_hash?: string }): Promise<ExposureDetail> =>
    firstValueFrom(this.http.post<ExposureDetail>(`${this.base}/exposures/${id}/${action}`, body));

  setRegistryUrl = (originId: string, url: string): Promise<PublishedOrigin> =>
    firstValueFrom(this.http.patch<PublishedOrigin>(`${this.base}/published-origins/${originId}`, { url }));
}
