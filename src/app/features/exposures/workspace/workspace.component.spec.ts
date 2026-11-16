import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { provideRouter } from '@angular/router';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import type { ExposureDetail } from '@core/models';
import { EXPOSURES } from '../../../../test/fixtures/exposures';
import { ExposuresApi } from '../data/exposures.api';
import { WorkspaceComponent } from './workspace.component';

async function renderWorkspace(exposure: ExposureDetail) {
  const api: Partial<ExposuresApi> = { get: async () => exposure };
  await render(WorkspaceComponent, {
    componentInputs: { id: exposure.id },
    providers: [
      provideRouter([]),
      provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
      { provide: ExposuresApi, useValue: api }
    ]
  });
  await screen.findByRole('heading', { level: 1, name: exposure.app.name });
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
});
