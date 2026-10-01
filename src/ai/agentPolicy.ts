// Bound inactivity and repeated failure, not productive task duration.
export const AGENT_LIMITS = { noProgressTurns: 4, consecutiveErrors: 3, outputPerTurn: 8192, idleTimeoutMs: 180_000 } as const;
