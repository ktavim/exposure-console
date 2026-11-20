import { InjectionToken, effect, inject, signal } from '@angular/core';
import { QueryClient } from '@tanstack/angular-query-experimental';
import { ConfigurationService } from '@core/configuration.service';
import { type ExposureEvent, TERMINAL_EVENTS } from '@core/models';
import { exposureKeys } from './exposures.queries';

/** Opens an EventSource; a token so tests can hand out a fake one. */
export const EVENT_SOURCE = new InjectionToken<(url: string) => EventSource>('EVENT_SOURCE', {
  providedIn: 'root',
  factory: () => (url: string) => new EventSource(url, { withCredentials: true })
});

export type StreamState = 'connecting' | 'live' | 'reconnecting' | 'ended';

/**
 * An exposure's event log, streamed from GET /exposures/{id}/events: the
 * events so far, then each new one as it happens.
 *
 * The browser reconnects an EventSource whenever the server ends the stream,
 * resuming after Last-Event-ID. The server ends it after the event that closes
 * the exposure, so the stream is closed here on that event, rather than
 * reconnecting to a log that will never grow.
 */
export function injectExposureEvents(id: () => string) {
  const openSource = inject(EVENT_SOURCE);
  const base = inject(ConfigurationService).apiBase;
  const queryClient = inject(QueryClient);
  const events = signal<ExposureEvent[]>([]);
  const state = signal<StreamState>('connecting');

  effect((onCleanup) => {
    const exposureId = id();
    events.set([]);
    state.set('connecting');
    const openedAt = Date.now();
    const source = openSource(`${base}/exposures/${exposureId}/events`);
    let ended = false;
    const end = () => {
      if (ended) return;
      ended = true;
      source.close();
      state.set('ended');
    };

    source.onopen = () => {
      if (!ended) state.set('live');
    };
    source.onerror = () => {
      if (!ended) state.set('reconnecting');
    };
    source.onmessage = (message: MessageEvent<string>) => {
      let event: ExposureEvent;
      try {
        event = JSON.parse(message.data) as ExposureEvent;
      } catch {
        return;
      }
      // A reconnect resumes after the last id, but never count one twice.
      events.update((list) => (list.some((e) => e.seq === event.seq) ? list : [...list, event]));
      // An event newer than the page means the exposure itself may have
      // changed: another admin saved the grouping, or the agent moved it on.
      // Approximate, as it compares the server's clock with this one.
      if (event.ts >= openedAt) {
        void queryClient.invalidateQueries({ queryKey: exposureKeys.detail(exposureId) });
      }
      if (TERMINAL_EVENTS.includes(event.type)) end();
    };

    onCleanup(end);
  });

  return { events: events.asReadonly(), state: state.asReadonly() };
}
