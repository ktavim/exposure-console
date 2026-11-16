import { render, screen, waitFor, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { provideRouter } from '@angular/router';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import type { ExposureDetail, ExposureEvent } from '@core/models';
import { EXPOSURES, eventsFor } from '../../../../test/fixtures/exposures';
import { EVENT_SOURCE } from '../data/exposure-events';
import { ExposuresApi } from '../data/exposures.api';
import { WorkspaceComponent } from './workspace.component';

/** Stands in for the browser's EventSource; the test opens it and pushes events. */
class FakeEventSource {
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((message: MessageEvent<string>) => void) | null = null;
  closed = false;
  constructor(readonly url: string) {}
  open() {
    this.onopen?.();
  }
  emit(event: ExposureEvent) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(event), lastEventId: event.seq }));
  }
  close() {
    this.closed = true;
  }
}

async function renderWorkspace(exposure: ExposureDetail) {
  const fetches = { count: 0 };
  const api: Partial<ExposuresApi> = {
    get: async () => {
      fetches.count++;
      return exposure;
    }
  };
  const sources: FakeEventSource[] = [];
  await render(WorkspaceComponent, {
    componentInputs: { id: exposure.id },
    providers: [
      provideRouter([]),
      provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
      { provide: ExposuresApi, useValue: api },
      {
        provide: EVENT_SOURCE,
        useValue: (url: string) => {
          const source = new FakeEventSource(url);
          sources.push(source);
          return source as unknown as EventSource;
        }
      }
    ]
  });
  await screen.findByRole('heading', { level: 1, name: exposure.app.name });
  return { fetches, source: () => sources[sources.length - 1] };
}

const sidebar = () => screen.getByRole('complementary', { name: 'Exposure sections' });
const detail = (name: string) => screen.getByRole('region', { name });

describe('WorkspaceComponent', () => {
  const [ready, blocked] = EXPOSURES;

  it('opens on the VIP groups, each service a card with its warnings', async () => {
    await renderWorkspace(ready);
    const board = detail('VIP groups');
    const card = within(board).getByRole('article', { name: 'https://reports.corp.internal' });
    expect(within(card).getByText(/Found only by the interceptor/)).toBeInTheDocument();
    expect(within(board).getByRole('article', { name: 'https://api.payroll.corp.internal:8443' })).toBeInTheDocument();
    // Published and excluded services are not cards.
    expect(within(board).queryByRole('article', { name: 'https://hr-legacy.corp.internal' })).toBeNull();
    expect(within(board).queryByRole('article', { name: 'https://metrics.corp.internal' })).toBeNull();
  });

  it('shows one group when it is picked in the left pane', async () => {
    await renderWorkspace(ready);
    await userEvent.click(within(sidebar()).getByRole('button', { name: /VIP 2 · reports, sso/ }));
    const pane = detail('VIP 2 · reports, sso');
    expect(within(pane).getAllByRole('article')).toHaveLength(2);
    expect(within(pane).queryByRole('article', { name: 'https://api.payroll.corp.internal' })).toBeNull();
  });

  it('shows the read-only sections as tables', async () => {
    await renderWorkspace(ready);
    await userEvent.click(within(sidebar()).getByRole('button', { name: /Already published/ }));
    expect(within(detail('Already published')).getByText('https://hr-legacy.example.com', { exact: false })).toBeInTheDocument();
    await userEvent.click(within(sidebar()).getByRole('button', { name: /Excluded/ }));
    expect(within(detail('Excluded')).getByText('https://metrics.corp.internal')).toBeInTheDocument();
  });

  it('lists what blocks planning, and the app-wide reasons on the board too', async () => {
    await renderWorkspace(blocked);
    expect(within(detail('VIP groups')).getByText(/The app has no URL/)).toBeInTheDocument();
    await userEvent.click(within(sidebar()).getByRole('button', { name: /What blocks planning/ }));
    const pane = detail('What blocks planning');
    expect(within(pane).getByText(/uses Kerberos/)).toBeInTheDocument();
    expect(within(pane).getByText(/registry entry has no URL/)).toBeInTheDocument();
  });

  describe('event log', () => {
    const [ready, revised, superseded] = EXPOSURES;

    it('lists the events newest first, and says the stream is live', async () => {
      const { source } = await renderWorkspace(revised);
      expect(source().url).toBe(`/api/exposures/${revised.id}/events`);
      source().open();
      eventsFor(revised.id).forEach((e) => source().emit(e));
      await userEvent.click(within(sidebar()).getByRole('button', { name: /Event log/ }));
      const pane = detail('Event log');
      expect(within(pane).getByText('Live')).toBeInTheDocument();
      const items = within(pane).getAllByRole('listitem');
      expect(items.map((li) => li.textContent)).toEqual([
        expect.stringContaining('mlevi · Saved the grouping (version 3)'),
        expect.stringContaining('mlevi · Saved the grouping (version 2)'),
        expect.stringContaining('rkatz · Submitted scan c1d2e3f4; exposure created')
      ]);
    });

    it('closes the stream on the event that closes the exposure', async () => {
      const { source } = await renderWorkspace(superseded);
      source().open();
      eventsFor(superseded.id).forEach((e) => source().emit(e));
      expect(source().closed).toBe(true);
      await userEvent.click(within(sidebar()).getByRole('button', { name: /Event log/ }));
      expect(within(detail('Event log')).getByText('Complete')).toBeInTheDocument();
    });

    it('reloads the exposure when something new happens to it', async () => {
      const { source, fetches } = await renderWorkspace(ready);
      source().open();
      const old = eventsFor(ready.id);
      old.forEach((e) => source().emit(e));
      expect(fetches.count).toBe(1);
      source().emit({ ...old[0], seq: String(old.length), ts: Date.now(), type: 'grouping_saved', actor: 'dcohen', payload: { version: 2 } });
      await waitFor(() => expect(fetches.count).toBe(2));
    });
  });
});
