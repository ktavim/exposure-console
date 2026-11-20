import { HttpErrorResponse } from '@angular/common/http';
import { render, screen, waitFor, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { provideRouter } from '@angular/router';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import type { ExposureDetail, ExposureEvent } from '@core/models';
import { EXPOSURES, eventsFor } from '../../../../test/fixtures/exposures';
import { EVENT_SOURCE } from '../data/exposure-events';
import { exposureKeys } from '../data/exposures.queries';
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

async function renderWorkspace(exposure: ExposureDetail, writes: Partial<ExposuresApi> = {}) {
  const fetches = { count: 0 };
  const api = {
    get: async () => {
      fetches.count++;
      return exposure;
    },
    saveGroups: vi.fn(async () => ({ ...exposure, version: exposure.version + 1 })),
    setRegistryUrl: vi.fn(async () => ({})),
    act: vi.fn(async () => exposure),
    ...writes
  };
  const sources: FakeEventSource[] = [];
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(WorkspaceComponent, {
    componentInputs: { id: exposure.id },
    providers: [
      provideRouter([]),
      provideTanStackQuery(client),
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
  return { fetches, api, client, source: () => sources[sources.length - 1] };
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
    const deploying = {
      code: 'earlier_exposure_deploying',
      message: 'exp_0000000099, an earlier submission of this app, is still deploying; plan once it has finished.',
      service_id: null
    };
    await renderWorkspace({ ...structuredClone(blocked), blocked_by: [...blocked.blocked_by, deploying] });
    expect(within(detail('VIP groups')).getByText(/is still deploying/)).toBeInTheDocument();
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

  describe('editing the grouping', () => {
    // Each test edits its own copy; the fixtures stay as they are.
    const fresh = (i: number) => structuredClone(EXPOSURES[i]);
    const card = (origin: string) => screen.getByRole('article', { name: origin });
    const saveBar = () => screen.queryByRole('region', { name: 'Unsaved changes' });
    const conflict = (status: number, detail: unknown) =>
      new HttpErrorResponse({ status, statusText: 'Error', error: { detail } });

    it('moves a card with the keyboard and saves the whole grouping', async () => {
      const e = fresh(0);
      const { api } = await renderWorkspace(e);
      expect(saveBar()).toBeNull();
      card('https://reports.corp.internal').focus();
      await userEvent.keyboard('1');
      expect(within(screen.getByRole('group', { name: /^VIP 1/ })).getByRole('article', { name: 'https://reports.corp.internal' })).toBeInTheDocument();
      // The card keeps the focus in its new column.
      await waitFor(() => expect(card('https://reports.corp.internal')).toHaveFocus());
      expect(saveBar()).toHaveTextContent('Unsaved changes to the grouping');

      await userEvent.click(screen.getByRole('button', { name: 'Save grouping' }));
      const id = (host: string, port = 443) => e.services.find((s) => s.host === host && s.port === port)!.id;
      expect(api.saveGroups).toHaveBeenCalledWith(e.id, {
        version: e.version,
        groups: [
          { id: e.groups[0].id, service_ids: [id('api.payroll.corp.internal'), id('api.payroll.corp.internal', 8443), id('reports.corp.internal')] },
          { id: e.groups[1].id, service_ids: [id('sso.corp.internal')] }
        ]
      });
      await waitFor(() => expect(saveBar()).toBeNull());
    });

    it('will not save while a service is in no group', async () => {
      await renderWorkspace(fresh(0));
      card('https://sso.corp.internal').focus();
      await userEvent.keyboard('0');
      expect(within(screen.getByRole('group', { name: 'Not grouped' })).getByRole('article')).toBeInTheDocument();
      expect(saveBar()).toHaveTextContent('Put the service that is not in a group into one to save.');
      expect(screen.getByRole('button', { name: 'Save grouping' })).toBeDisabled();
    });

    it('makes a new VIP with N, and discards back to the saved grouping', async () => {
      await renderWorkspace(fresh(0));
      card('https://sso.corp.internal').focus();
      await userEvent.keyboard('n');
      expect(within(screen.getByRole('group', { name: /^VIP 3/ })).getByRole('article', { name: 'https://sso.corp.internal' })).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
      expect(screen.queryByRole('group', { name: /^VIP 3/ })).toBeNull();
      expect(saveBar()).toBeNull();
    });

    it('says why a save was refused for a stale version', async () => {
      const e = fresh(0);
      await renderWorkspace(e, {
        saveGroups: vi.fn(async () => {
          throw conflict(409, { message: 'the exposure is at version 2; this grouping was made against version 1', status: 'grouping', version: 2 });
        })
      });
      card('https://reports.corp.internal').focus();
      await userEvent.keyboard('1');
      await userEvent.click(screen.getByRole('button', { name: 'Save grouping' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Not saved: the exposure is at version 2');
    });

    it('marks the cards the server refused', async () => {
      const e = fresh(0);
      const sso = e.services.find((s) => s.host === 'sso.corp.internal')!;
      await renderWorkspace(e, {
        saveGroups: vi.fn(async () => {
          throw conflict(422, {
            message: 'each service that needs a VIP must be in exactly one group',
            errors: [{ code: 'not_in_scope', message: 'https://sso.corp.internal does not need a VIP (published).', service_id: sso.id }]
          });
        })
      });
      card('https://reports.corp.internal').focus();
      await userEvent.keyboard('1');
      await userEvent.click(screen.getByRole('button', { name: 'Save grouping' }));
      expect(await within(card('https://sso.corp.internal')).findByText(/does not need a VIP/)).toBeInTheDocument();
    });

    it('keeps unsaved changes when someone else saves, and offers to reload', async () => {
      const e = fresh(0);
      const { client } = await renderWorkspace(e);
      card('https://reports.corp.internal').focus();
      await userEvent.keyboard('1');
      client.setQueryData(exposureKeys.detail(e.id), { ...e, version: e.version + 1 });
      expect(await screen.findByText(/changed this exposure while you were editing \(now version 2\)/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Save grouping' })).toBeDisabled();
      await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
      expect(saveBar()).toBeNull();
      expect(within(screen.getByRole('group', { name: /^VIP 2/ })).getByRole('article', { name: 'https://reports.corp.internal' })).toBeInTheDocument();
    });

    it('leaves a closed exposure read-only', async () => {
      await renderWorkspace(fresh(2));
      card('https://api.payroll.corp.internal').focus();
      await userEvent.keyboard('n');
      expect(screen.queryByRole('group', { name: /^VIP 2/ })).toBeNull();
      expect(saveBar()).toBeNull();
    });

    it("sets a registry entry's URL from what blocks planning", async () => {
      const e = fresh(1);
      const entry = e.services.find((s) => s.host === 'files.corp.internal')!.registry_entry!;
      const { api } = await renderWorkspace(e);
      await userEvent.click(within(sidebar()).getByRole('button', { name: /What blocks planning/ }));
      const pane = detail('What blocks planning');
      const item = within(pane).getByText(/registry entry has no URL/).closest('li')!;
      await userEvent.click(within(item).getByRole('button', { name: 'Set URL' }));
      await userEvent.type(within(item).getByRole('textbox', { name: 'Registry URL' }), 'https://files.example.com');
      await userEvent.click(within(item).getByRole('button', { name: 'Save' }));
      expect(api.setRegistryUrl).toHaveBeenCalledWith(entry.id, 'https://files.example.com');
    });
  });

  describe('planning and confirming', () => {
    const fresh = (i: number) => structuredClone(EXPOSURES[i]);
    const planned = () => fresh(3);

    it('opens a planned exposure on its plan', async () => {
      const e = planned();
      await renderWorkspace(e);
      const pane = detail('What deploying does');
      expect(within(pane).getByText('api-expenses.example.com')).toBeInTheDocument();
      expect(within(pane).getByText(`+${e.plan!.summary.add}`)).toBeInTheDocument();
      await userEvent.click(within(sidebar()).getByRole('button', { name: `VIP 1 ${e.plan!.vips[0].ip} ${e.plan!.vips[0].services.length}` }));
      expect(within(detail('VIP 1 ' + e.plan!.vips[0].ip)).getByText('https://api-expenses-8443.example.com')).toBeInTheDocument();
      await userEvent.click(within(sidebar()).getByRole('button', { name: /App VIP/ }));
      const map = detail('App VIP · rewrite map');
      expect(within(map).getAllByText('this plan')).toHaveLength(e.plan!.rewrite.filter((r) => r.source === 'new').length);
      expect(within(map).getByText('the app itself')).toBeInTheDocument();
      await userEvent.click(within(sidebar()).getByRole('button', { name: /Dry-run diff/ }));
      expect(within(detail('Dry-run diff')).getByText(`+${e.plan!.diff.filter((l) => l.op === '+').length}`)).toBeInTheDocument();
    });

    it('confirms only once every warning is acknowledged, naming the plan', async () => {
      const e = planned();
      const { api } = await renderWorkspace(e);
      await userEvent.click(screen.getByRole('button', { name: /Review and deploy/ }));
      const panel = screen.getByRole('dialog', { name: 'Deploy Expenses' });
      const deploy = within(panel).getByRole('button', { name: 'Deploy to F5' });
      const boxes = within(panel).getAllByRole('checkbox');
      // The interceptor-only service's warning, and the one every app gets.
      expect(boxes).toHaveLength(2);
      await userEvent.click(boxes[0]);
      expect(deploy).toBeDisabled();
      await userEvent.click(boxes[1]);
      await userEvent.click(deploy);
      expect(api.act).toHaveBeenCalledWith(e.id, 'confirm', { version: 2, plan_hash: e.plan_hash });
    });

    it('requests a plan when nothing blocks it, and not otherwise', async () => {
      const ready = fresh(0);
      const { api } = await renderWorkspace(ready);
      await userEvent.click(screen.getByRole('button', { name: /Request plan/ }));
      expect(api.act).toHaveBeenCalledWith(ready.id, 'plan', { version: 1, plan_hash: undefined });
    });

    it('will not request a plan while something blocks it', async () => {
      await renderWorkspace(fresh(1));
      expect(screen.getByRole('button', { name: /Request plan/ })).toBeDisabled();
    });

    it('says where a phase failed, and retries it', async () => {
      const e = { ...planned(), status: 'failed' as const, plan: null, failed: { phase: 'planning' as const, step: 'dry_run', message: 'AS3 refused the declaration' } };
      const { api } = await renderWorkspace(e);
      expect(screen.getByRole('alert')).toHaveTextContent('Planning failed at dry_run.');
      expect(screen.getByRole('alert')).toHaveTextContent('AS3 refused the declaration');
      await userEvent.click(screen.getByRole('button', { name: /Retry planning/ }));
      expect(api.act).toHaveBeenCalledWith(e.id, 'retry', { version: 2, plan_hash: undefined });
    });

    it('cancels after saying what will be released', async () => {
      const e = planned();
      const { api } = await renderWorkspace(e);
      await userEvent.click(screen.getByRole('button', { name: /Cancel exposure/ }));
      const dialog = screen.getByRole('alertdialog', { name: 'Cancel this exposure?' });
      expect(dialog).toHaveTextContent(e.plan!.vips[0].ip);
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel exposure' }));
      expect(api.act).toHaveBeenCalledWith(e.id, 'cancel', { version: 2, plan_hash: undefined });
    });

    it("shows the agent's steps for the current version while it plans", async () => {
      const e = { ...fresh(0), status: 'planning' as const };
      const { source } = await renderWorkspace(e);
      source().open();
      const step = (seq: number, version: number, name: string, state: string, message = '') =>
        source().emit({ exposure_id: e.id, seq: String(seq), ts: 0, type: 'agent_step', actor: 'agent', payload: { version, step: name, state, message } });
      step(0, 0, 'old_step', 'done');
      step(1, 1, 'reserve_ips', 'started');
      step(2, 1, 'reserve_ips', 'done', 'grp_1 203.0.113.1');
      step(3, 1, 'certificates', 'started');
      const progress = await screen.findByRole('status', { name: 'Agent progress' });
      // Every step of the phase from the start, the old version's report left out.
      await waitFor(() =>
        expect(within(progress).getAllByRole('listitem').map((li) => li.getAttribute('aria-label'))).toEqual([
          'Form the public names: to do',
          'Reserve IP addresses: done',
          'Issue and install certificates: under way',
          'Render the declaration: to do',
          'Dry-run it on the F5: to do'
        ])
      );
      expect(within(progress).getByText(/grp_1 203\.0\.113\.1/)).toBeInTheDocument();
      expect(progress).toHaveTextContent('Planning: the agent is at work.');
    });
  });

  describe('deploying', () => {
    const fresh = (i: number) => structuredClone(EXPOSURES[i]);
    const replay = (source: () => { emit(event: ExposureEvent): void }, id: string) => {
      for (const event of eventsFor(id)) source().emit(event);
    };

    it('says who confirmed a deploy, and lists its steps as the agent reports them', async () => {
      const e: ExposureDetail = { ...fresh(3), status: 'deploying', confirmed_by: 'mlevi', confirmed_at: '2026-11-16T10:00:00+00:00' };
      const { source } = await renderWorkspace(e);
      const progress = screen.getByRole('status', { name: 'Agent progress' });
      expect(progress).toHaveTextContent('Deploying: waiting for the agent to pick it up.');
      expect(progress).toHaveTextContent('Confirmed by mlevi');
      expect(progress).toHaveTextContent('A deploy in progress cannot be stopped.');
      source().emit({ exposure_id: e.id, seq: '90', ts: 0, type: 'agent_step', actor: 'agent', payload: { version: 2, step: 'recheck', state: 'skipped', message: 'done in an earlier attempt' } });
      source().emit({ exposure_id: e.id, seq: '91', ts: 0, type: 'agent_step', actor: 'agent', payload: { version: 2, step: 'deploy', state: 'started', message: null } });
      await waitFor(() => expect(progress).toHaveTextContent('Deploying: the agent is at work.'));
      expect(within(progress).getAllByRole('listitem').map((li) => li.getAttribute('aria-label'))).toEqual([
        'Recheck the plan against the F5: done earlier',
        'Post the declaration: under way',
        'Verify the VIPs and the rewriting: to do',
        'Create the DNS records: to do'
      ]);
    });

    it('opens a deployed exposure on where it is live and what it left behind', async () => {
      const e = fresh(4);
      await renderWorkspace(e);
      const pane = detail('Deployed');
      const d = e.deployment!;
      expect(within(pane).getByRole('link', { name: d.public_url })).toHaveAttribute('href', d.public_url);
      expect(pane).toHaveTextContent(`Confirmed by ${e.confirmed_by}`);
      for (const r of d.dns_records) expect(within(pane).getByText(r.name)).toBeInTheDocument();
      for (const vs of d.virtual_servers) expect(within(pane).getByText(vs)).toBeInTheDocument();
      expect(within(pane).getByText(d.registered[0].url)).toBeInTheDocument();
      expect(within(sidebar()).getByRole('button', { name: 'Deployment' })).toHaveAttribute('aria-current', 'true');
      // Nothing to do on a deployed exposure.
      expect(screen.queryByRole('button', { name: /Cancel exposure|Retry|Request plan/ })).toBeNull();
    });

    it('moves to the deployment when the deploy it shows finishes', async () => {
      let current: ExposureDetail = { ...fresh(3), status: 'deploying', confirmed_by: 'mlevi', confirmed_at: '2026-11-16T10:00:00+00:00' };
      const { client } = await renderWorkspace(current, { get: async () => structuredClone(current) });
      expect(screen.queryByRole('region', { name: 'Deployed' })).toBeNull();
      current = { ...current, status: 'deployed', deployment: fresh(4).deployment, deployed_at: '2026-11-16T10:03:00+00:00' };
      await client.invalidateQueries({ queryKey: exposureKeys.detail(current.id) });
      expect(await screen.findByRole('region', { name: 'Deployed' })).toBeInTheDocument();
    });

    it('shows where a deploy stopped, retries from that step, and says what cancelling undoes', async () => {
      const e = fresh(5);
      const { api, source } = await renderWorkspace(e);
      replay(source, e.id);
      expect(screen.getByRole('alert')).toHaveTextContent('Deploying failed at verify.');
      const stopped = await screen.findByRole('group', { name: 'Where it stopped' });
      await waitFor(() =>
        expect(within(stopped).getAllByRole('listitem').map((li) => li.getAttribute('aria-label'))).toEqual([
          'Recheck the plan against the F5: done',
          'Post the declaration: done',
          'Verify the VIPs and the rewriting: failed',
          'Create the DNS records: to do'
        ])
      );

      await userEvent.click(screen.getByRole('button', { name: /Cancel exposure/ }));
      const dialog = screen.getByRole('alertdialog', { name: 'Cancel this exposure?' });
      expect(dialog).toHaveTextContent('The agent undoes the deploy, in reverse:');
      expect(dialog).toHaveTextContent(`Partition ${e.plan!.partition} is removed from the F5`);
      // The DNS step never began, so there are no records to delete.
      expect(dialog).not.toHaveTextContent('DNS records');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Keep it' }));

      await userEvent.click(screen.getByRole('button', { name: 'Retry from verify' }));
      expect(api.act).toHaveBeenCalledWith(e.id, 'retry', { version: 1, plan_hash: undefined });
    });
  });
});
