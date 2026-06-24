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
