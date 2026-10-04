// Per-turn / inactivity guards; whole-task limits are configured in taskBudget.ts.
export const AGENT_LIMITS = { noProgressTurns: 4, consecutiveErrorTurns: 3, outputPerTurn: 8192, idleTimeoutMs: 180_000 } as const;
