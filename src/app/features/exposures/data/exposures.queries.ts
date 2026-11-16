import { inject } from '@angular/core';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { CLOSED_STATUSES, type ExposureDetail } from '@core/models';
import { type ExposureAction, ExposuresApi, type SaveGroupingBody } from './exposures.api';

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

/** While the agent works on an exposure: the event stream reloads it on each step, and this catches what the stream misses. */
const AGENT_STATUSES = ['planning', 'deploying', 'cancelling'];

export function useExposureQuery(id: () => string) {
  const api = inject(ExposuresApi);
  return injectQuery(() => ({
    queryKey: exposureKeys.detail(id()),
    queryFn: (): Promise<ExposureDetail> => api.get(id()),
    refetchInterval: (query: { state: { data?: ExposureDetail } }) =>
      AGENT_STATUSES.includes(query.state.data?.status ?? '') ? 5_000 : false
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

/** Set a registry entry's URL, which an exposure that calls its origin needs to be planned. */
export function useSetUrlMutation(id: () => string) {
  const api = inject(ExposuresApi);
  const client = inject(QueryClient);
  return injectMutation(() => ({
    mutationFn: (target: { entryId: string; url: string }) => api.setRegistryUrl(target.entryId, target.url),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: exposureKeys.detail(id()) });
      void client.invalidateQueries({ queryKey: exposureKeys.queue() });
    }
  }));
}

/** Request a plan, confirm it, retry, or cancel; the exposure it returns replaces the cached one. */
export function useExposureActionMutation(id: () => string) {
  const api = inject(ExposuresApi);
  const client = inject(QueryClient);
  return injectMutation(() => ({
    mutationFn: (request: { action: ExposureAction; version: number; plan_hash?: string }) =>
      api.act(id(), request.action, { version: request.version, plan_hash: request.plan_hash }),
    onSuccess: (detail) => {
      client.setQueryData(exposureKeys.detail(detail.id), detail);
      void client.invalidateQueries({ queryKey: exposureKeys.all });
    }
  }));
}
