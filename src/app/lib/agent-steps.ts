import type { AgentPhase, ExposureEvent } from '@core/models';

/**
 * The steps the agent takes in each phase, in order, as it names them in its
 * reports (exposure-agent: agent/planner.py and agent/deployer.py). The
 * console lists them all from the start, so the admin sees what is still to
 * come; a step the agent reports that is not here is shown after them.
 */
export const PHASE_STEPS: Record<AgentPhase, readonly { step: string; label: string }[]> = {
  planning: [
    { step: 'names', label: 'Form the public names' },
    { step: 'reserve_ips', label: 'Reserve IP addresses' },
    { step: 'certificates', label: 'Issue and install certificates' },
    { step: 'render', label: 'Render the declaration' },
    { step: 'dry_run', label: 'Dry-run it on the F5' }
  ],
  deploying: [
    { step: 'recheck', label: 'Recheck the plan against the F5' },
    { step: 'deploy', label: 'Post the declaration' },
    { step: 'verify', label: 'Verify the VIPs and the rewriting' },
    { step: 'dns', label: 'Create the DNS records' }
  ],
  cancelling: [
    { step: 'remove_dns', label: 'Delete the DNS records' },
    { step: 'restore_declaration', label: 'Restore the partition' },
    { step: 'remove_certificates', label: 'Remove the certificates' },
    { step: 'release_ips', label: 'Release the IP addresses' }
  ]
};

const KNOWN = new Set(Object.values(PHASE_STEPS).flatMap((steps) => steps.map((s) => s.step)));

/** pending: not reported yet. skipped: done by an earlier attempt, which a retry resumed after. */
export type StepState = 'pending' | 'started' | 'done' | 'skipped' | 'failed' | 'info';

export interface StepProgress {
  step: string;
  label: string;
  state: StepState;
  message: string;
}

/** The label of a step, or its name for one this list does not know. */
export function stepLabel(phase: AgentPhase, step: string): string {
  return PHASE_STEPS[phase].find((s) => s.step === step)?.label ?? step;
}

/**
 * Each step of a phase with its latest report for one version, in the
 * phase's order. A phase shares its version with the others (a plan and its
 * deploy have the same one), so the steps are told apart by name.
 */
export function phaseProgress(phase: AgentPhase, events: readonly ExposureEvent[], version: number): StepProgress[] {
  const latest = new Map<string, { state: StepState; message: string }>();
  for (const ev of events) {
    if (ev.type !== 'agent_step' || ev.payload['version'] !== version) continue;
    const message = typeof ev.payload['message'] === 'string' ? ev.payload['message'] : '';
    latest.set(String(ev.payload['step']), { state: ev.payload['state'] as StepState, message });
  }
  const known = PHASE_STEPS[phase].map(({ step, label }) => ({
    step,
    label,
    state: latest.get(step)?.state ?? ('pending' as StepState),
    message: latest.get(step)?.message ?? ''
  }));
  const other = [...latest.entries()]
    .filter(([step]) => !KNOWN.has(step))
    .map(([step, report]) => ({ step, label: step, ...report }));
  return [...known, ...other];
}

/** Whether the agent began a step at this version: what cancel must undo. */
export function stepBegun(events: readonly ExposureEvent[], version: number, step: string): boolean {
  return events.some((ev) => ev.type === 'agent_step' && ev.payload['version'] === version && ev.payload['step'] === step);
}
