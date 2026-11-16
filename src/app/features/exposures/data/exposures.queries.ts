import { inject } from '@angular/core';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { CLOSED_STATUSES } from '@core/models';
import { ExposuresApi, type SaveGroupingBody } from './exposures.api';

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

/** Save the grouping; the exposure it returns replaces the cached one. */
export function useSaveGroupsMutation(id: () => string) {
  const api = inject(ExposuresApi);
  const client = inject(QueryClient);
  return injectMutation(() => ({
    mutationFn: (body: SaveGroupingBody) => api.saveGroups(id(), body),
    onSuccess: (detail) => {
      client.setQueryData(exposureKeys.detail(detail.id), detail);
      void client.invalidateQueries({ queryKey: exposureKeys.queue() });
    }
  }));
}

/** Set the app's URL, or a registry entry's; either changes what blocks the exposure's planning. */
export function useSetUrlMutation(id: () => string) {
  const api = inject(ExposuresApi);
  const client = inject(QueryClient);
  return injectMutation(() => ({
    mutationFn: (target: { kind: 'app' | 'registry'; targetId: string; url: string }) =>
      target.kind === 'app' ? api.setAppUrl(target.targetId, target.url) : api.setRegistryUrl(target.targetId, target.url),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: exposureKeys.detail(id()) });
      void client.invalidateQueries({ queryKey: exposureKeys.queue() });
    }
  }));
}
