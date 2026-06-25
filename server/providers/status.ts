import type { NormalizedStatus } from "../types.js";

export function toMalStatus(status?: NormalizedStatus): string | undefined {
  if (!status) return undefined;
  return {
    current: "watching",
    planning: "plan_to_watch",
    completed: "completed",
    paused: "on_hold",
    dropped: "dropped",
    repeating: "watching"
  }[status];
}

export function fromMalStatus(status?: string): NormalizedStatus | undefined {
  if (!status) return undefined;
  return {
    watching: "current",
    plan_to_watch: "planning",
    completed: "completed",
    on_hold: "paused",
    dropped: "dropped"
  }[status] as NormalizedStatus | undefined;
}

export function toAniListStatus(status?: NormalizedStatus): string | undefined {
  if (!status) return undefined;
  return {
    current: "CURRENT",
    planning: "PLANNING",
    completed: "COMPLETED",
    paused: "PAUSED",
    dropped: "DROPPED",
    repeating: "REPEATING"
  }[status];
}

export function fromAniListStatus(status?: string): NormalizedStatus | undefined {
  if (!status) return undefined;
  return {
    CURRENT: "current",
    PLANNING: "planning",
    COMPLETED: "completed",
    PAUSED: "paused",
    DROPPED: "dropped",
    REPEATING: "repeating"
  }[status] as NormalizedStatus | undefined;
}
