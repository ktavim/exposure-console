import { inject } from '@angular/core';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { CLOSED_STATUSES } from '@core/models';
import { ExposuresApi } from './exposures.api';

export const exposureKeys = {
  all: ['exposures'] as const,
  queue: () => [...exposureKeys.all, 'queue'] as const,
  history: () => [...exposureKeys.all, 'history'] as const,
  detail: (id: string) => [...exposureKeys.all, 'detail', id] as const
};

export type ExposureList = 'queue' | 'history';

/** The queue (open exposures) or the history (closed ones). */
export function useExposureListQuery(list: () => ExposureList) {
  const api = inject(ExposuresApi);
  return injectQuery(() => {
    const queue = list() === 'queue';
    return {
      queryKey: queue ? exposureKeys.queue() : exposureKeys.history(),
      queryFn: () => (queue ? api.listQueue() : api.listByStatus(CLOSED_STATUSES)),
      // New submissions show up in the queue without the admin reloading.
      refetchInterval: queue ? 30_000 : false
    };
  });
}

export function useExposureQuery(id: () => string) {
  const api = inject(ExposuresApi);
  return injectQuery(() => ({
    queryKey: exposureKeys.detail(id()),
    queryFn: () => api.get(id())
  }));
}
