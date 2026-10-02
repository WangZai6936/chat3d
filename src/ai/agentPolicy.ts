// Bound inactivity and repeated failure, not productive task duration.
export const AGENT_LIMITS = { noProgressTurns: 4, consecutiveErrorTurns: 3, outputPerTurn: 8192, idleTimeoutMs: 180_000 } as const;
