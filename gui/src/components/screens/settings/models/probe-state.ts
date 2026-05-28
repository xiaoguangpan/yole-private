import type { ProbeState, ProbeStateMap } from "./types";

export const idleProbeState: ProbeState = { kind: "idle" };

export function probeStateFor(states: ProbeStateMap, id: string): ProbeState {
  return states[id] ?? idleProbeState;
}

export function withProbeState(
  states: ProbeStateMap,
  id: string,
  state: ProbeState,
): ProbeStateMap {
  return { ...states, [id]: state };
}

export function withoutProbeState(
  states: ProbeStateMap,
  id: string,
): ProbeStateMap {
  if (!(id in states)) return states;
  const next = { ...states };
  delete next[id];
  return next;
}
