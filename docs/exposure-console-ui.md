# Exposure console: visual design

Status: outline. Being filled in during phase 2, while the console is built against mocked data.

What the console shows and lets the admin do is in `docs/exposure-design.md` in the network-interceptor repository, under Console. This file records how it looks: the decisions a developer would otherwise make one screen at a time. Mockups and prototypes are linked from here, not drawn here.

## Base look

Decided: the console has its own styling and theme, and does not reuse the scanner frontend's.

Decided, from prototype C (see Mockups):

- No component library: Tailwind over the console's own colour tokens (`src/styles/tokens.css`), in the manner of GitHub's Primer.
- A light and a dark theme, following the system's setting unless the admin picks one in the top bar.
- System UI font for text, the system monospace for origins, IPs, names and declarations.

To decide:

- Spacing scale and type sizes beyond what the first screens use.

## Status presentation

One label and colour per lifecycle status, used everywhere a status appears: the queue, the history, the workspace header.

Provisional, as `src/app/lib/status.ts` has it; each badge also carries an icon, so colour is not the only cue.

| Status | Label | Tone | Icon |
|---|---|---|---|
| `grouping` | Grouping | neutral | layers |
| `planning` | Planning | progress | loader |
| `awaiting_confirmation` | Awaiting confirmation | attention | clipboard-check |
| `deploying` | Deploying | progress | rocket |
| `deployed` | Deployed | success | circle-check |
| `failed` | Failed | danger | circle-x |
| `cancelling` | Cancelling | progress | undo |
| `cancelled` | Cancelled | muted | ban |
| `superseded` | Superseded | muted | arrow-right-left |

Also to decide: how the queue marks an exposure that something blocks from planning.

## Plan review

Decided, from prototype C: laid out like a pull request's changed files. The left pane lists the plan's parts (summary, each VIP, the app VIP's rewrite map, the dry-run diff, the declaration), each with its count of changes; the right pane shows the one selected. The diff is unified, with line numbers and a header per tenant. The declaration is shown whole, with a copy button.

The screen the admin approves from, so it needs the most attention. To decide:

- Syntax highlighting for the declaration and the diff.

Decided while building phase 4: once an exposure has a plan, the left pane gains a Plan section (Summary, each VIP, App VIP · rewrite map, Dry-run diff, Declaration), and a planned exposure opens on its Summary. The summary leads with cards for what changes on the F5, the IPs, the DNS names and the certificates, then the DNS records the deploy will create. While the agent works, a card above the pane lists its steps for the current version as they arrive; a failed phase shows as a banner naming the step and the agent's message, with Retry in the header.
- How each VIP's IP, DNS names, certificate and services are laid out, with each service's original origin next to the URL that replaces it.
- How the app's rewrite map is shown, with the `published` services' entries told apart from the new ones.
- Where the warnings sit relative to the confirm button. In C they appear only in the deploy panel, behind a count on the button; showing them in the plan review itself as well is worth considering.

## Grouping

Decided, from prototype C:

- The workspace is master and detail. The left pane lists all the groups together, what blocks planning, each VIP group with a dot saying whether something in it blocks planning, the services not in a group, and the read-only sections; the right pane shows the one selected.
- The groups are columns of service cards. A card moves by drag and drop, or from the keyboard: focus it and press 1 to 9 for a VIP, N for a new one, 0 to take it out of its group.
- A card shows its blockers in red and its warnings in amber, under the origin.
- `published` and excluded services are not cards: they are read-only sections of the left pane, shown as tables.

To decide:

- Whether the board needs a bulk move (select several cards, move them at once) for exposures with many services.

Decided while building phase 3:

- The grouping is a draft until saved. A bar at the foot of the board says there are unsaved changes, with Discard and Save grouping; Save is disabled, with the reason, while a service is in no group.
- When another admin saves while this one has unsaved changes, the board keeps them and shows a banner naming who saved and the new version, with Reload, which discards them; Save is disabled meanwhile.
- In `planning` and `awaiting_confirmation` the board is editable, under a note that saving drops the plan; past that it is read-only.
- A refused save says why in the bar; a refusal per service marks the cards it names in red.
- A registry entry's URL is set inline, where the blocker is listed, with the server's error under the field. (The app's URL used to be set the same way; every app has one now, required when the app is created.)

## Progress and failure

Decided: the event log is its own section of the workspace's left pane, under Activity, with a dot while its stream is live. Its pane is a timeline, newest first: who, what, and when to the second, with a link to any exposure an event names, and a pill saying whether the stream is live, reconnecting or complete.

Decided while building phase 5: while `planning`, `deploying` or `cancelling`, a card above the pane lists every step of the phase from the start, each done, under way, failed, skipped (done by an earlier attempt, which a retry resumed after) or still to come, with the agent's message beside it. During a deploy it adds who confirmed it, and that a deploy cannot be stopped. Once a phase failed, a banner names the step and the agent's message, and the same list sits under it, as "Where it stopped".

## Destructive actions

Confirm deploys to the F5; cancel releases IP reservations, certificates and DNS records. To decide:

- How these buttons are set apart from the rest.
- What their dialogs show: for confirm, the plan's summary; for cancel and retry, the lists described under Console in the design doc.

Decided for confirm, from prototype C: a side panel lists what deploying does, step by step, says a deploy cannot be stopped, and has a checkbox for each warning; Deploy is enabled once every one is ticked. The header's button counts the warnings to acknowledge.

Decided for cancel: a small dialog lists what the agent will release, the IPs and certificates from the plan, before a red Cancel exposure.

Decided while building phase 5:

- Retry after a failed deploy is labelled with the step it resumes from, as "Retry from verify".
- Cancelling after a failed deploy lists what the agent undoes, in its order: the DNS records it created and the partition's previous declaration, when those steps began, then the certificates and the IPs.
- A deployed exposure gains a Live section in the left pane, Deployment, and opens on it: where the app is live, who confirmed it and when, the virtual servers, the DNS records and the origins registered. A workspace watching a deploy moves to it when the deploy finishes.
- The header shows a deployed exposure's public URL beside the app's own.

## Density, dark mode, accessibility

To decide:

- Density, given the admins' screens and how many services an exposure can hold.
- Accessibility target, keyboard use of the grouping screen, and status colours that are not the only cue.

## References

Sites whose patterns fit a screen of the console. Take the patterns, not the branding: the console keeps its own look.

| Reference | What to take | Informs |
|---|---|---|
| HCP Terraform, a run's page | The flow closest to the console's: plan, review the diff, confirm and apply, follow the apply; the run list and its status badges; a summary of what will be added, changed and destroyed above the detail | Status presentation, Plan review, Progress and failure |
| GitHub, a pull request's changed files | Unified and split diffs, collapsible files, line numbers | Plan review |
| Argo CD, an application's diff and sync status | A desired declaration compared with the live state, status per resource; close to an AS3 dry-run | Plan review, Status presentation |
| Vercel, a deployment's page | Steps that appear as they run, a streaming log, a failed step that stands out | Progress and failure |
| Linear | Dense lists that still read well, status icons, keyboard navigation | Status presentation (the queue), Density |
| Cloudflare, the DNS records page | Tables of names, types and targets | Plan review (each VIP's names and IP) |
| IBM Carbon design system | Data tables, status indicators that do not rely on colour alone, dialogs for dangerous actions, accessibility guidance; a candidate for the component library | Base look, Destructive actions, Density, dark mode, accessibility |

Vercel's Geist and GitHub's Primer are lighter alternatives to Carbon, both with dark modes.

## Mockups

Three throwaway HTML prototypes in `docs/prototypes/`, each showing the grouping workspace and the plan review from the same data (`data.js`): an exposure with a Kerberos blocker, a published service with no registry URL, warnings, and a plan with its declaration and dry-run diff. Open `docs/prototypes/index.html` in a browser.

| Prototype | Direction | References it draws on |
|---|---|---|
| `a-dense.html` | Dense tables, light, compact; plan review in tabs, unified diff | Carbon, Linear, Cloudflare DNS |
| `b-run.html` | A run page: summary of what will change above the detail, a card per VIP, split diff, dark | HCP Terraform, Vercel |
| `c-split.html` | Master and detail: the VIPs listed on the left, the selected one on the right; grouping as columns to move services between | Argo CD, GitHub's changed files |

Chosen: **C**, on 2026-11-15. The console refines it rather than copying it: icons in the top bar, the left pane, the header's facts and every note; badges and notes with a soft fill and a border in their own hue; a numbered badge per VIP group, ringed in red when the group blocks planning; cards with shadow, auth-method pills and the scanners as tags; loading skeletons and empty states with an icon; one keyboard focus ring. The sections above record what it settles. Worth taking from the others, not yet decided: A's density for the tables, and B's step timeline, which could sit in C's header.
