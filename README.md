# exposure-console

The F5 BIG-IP administrators' console for publishing submitted apps through the F5. It shows each submitted app's external services that still need a VIP, lets the admin group them into VIPs, and follows the plan, confirmation and deploy. The design is in `network-interceptor/docs/exposure-design.md`; what the console shows is under its Console section.

Built with Angular 21, Tailwind, TanStack Query and MSW, like the scanner frontend (f35-radar), but with its own look.

## Status

Phases 2 to 4: the queue, the history and an exposure's workspace with its live event log; the grouping edited by drag and drop or the keyboard and saved; the app's and registry entries' URLs set where they block planning; requesting a plan, the agent's progress, the plan review and the deploy confirmation, retry and cancel. The mock agent in `src/test/msw/handlers.ts` answers a plan request with a real plan the exposure-agent produced (`src/test/fixtures/plan.json`). Against mocked data or the real backend. The look follows prototype C (`docs/exposure-console-ui.md`): a master-and-detail workspace, light and dark themes. There's no sign-in yet.

## Run

```powershell
npm install
npm start            # http://localhost:4300, against the MSW mocks in src/test/msw
```

The development build starts MSW (`environment.development.ts`, `enableMocks`). To use the real backend, set `enableMocks: false` and run the network-interceptor API on port 8000. `proxy.conf.json` forwards `/api` to it.

`public/config.json` holds the runtime settings: `apiBase`.

## Test

```powershell
npm test
npm run lint
npm run build
```

## Layout

```
src/app/core/models/       the backend's exposure API, typed
src/app/features/exposures/ data (API client, queries), queue/ (queue and history), workspace/
src/app/lib/               status presentation, origin formatting
src/app/shared/            status badge
src/app/core/theme.service.ts the light, dark or system theme, remembered per browser
src/styles/tokens.css      the theme's colour tokens, light and dark
src/test/                  fixtures, MSW handlers, Vitest setup
docs/exposure-console-ui.md how the console looks: decisions made and still open
docs/prototypes/           throwaway HTML prototypes of the workspace and plan review
```
