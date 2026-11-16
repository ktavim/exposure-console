import { delay, http, HttpResponse } from 'msw';
import { CLOSED_STATUSES, type ExposureStatus } from '@core/models';
import { EXPOSURES, toSummary } from '../fixtures/exposures';

/** The backend's read-only exposure endpoints, over the fixtures. */
export const handlers = [
  http.get('/api/exposures', async ({ request }) => {
    await delay(150);
    const statuses = new URL(request.url).searchParams.getAll('status') as ExposureStatus[];
    const open = statuses.length === 0;
    const selected = EXPOSURES.filter((e) =>
      open ? !CLOSED_STATUSES.includes(e.status) : statuses.includes(e.status)
    ).sort((a, b) => a.submitted_at.localeCompare(b.submitted_at) * (open ? 1 : -1));
    return HttpResponse.json(selected.map(toSummary));
  }),

  http.get('/api/exposures/:id', async ({ params }) => {
    await delay(150);
    const exposure = EXPOSURES.find((e) => e.id === params['id']);
    return exposure
      ? HttpResponse.json(exposure)
      : HttpResponse.json({ detail: { message: 'exposure not found' } }, { status: 404 });
  })
];
