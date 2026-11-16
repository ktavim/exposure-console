import { delay, http, HttpResponse, sse } from 'msw';
import { CLOSED_STATUSES, type ExposureStatus } from '@core/models';
import { EXPOSURES, eventsFor, toSummary } from '../fixtures/exposures';

/** The backend's read-only exposure endpoints, over the fixtures. */
export const handlers = [
  // The event log. Open exposures' streams stay open, as the backend's do;
  // nothing new arrives in the mock.
  sse<{ message: string }>('/api/exposures/:id/events', ({ params, client }) => {
    for (const event of eventsFor(String(params['id']))) {
      client.send({ id: event.seq, data: JSON.stringify(event) });
    }
  }),

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
