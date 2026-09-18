export type BudgetState = "ok" | "warning" | "suspended";

export interface BudgetSnapshot {
  spentUsd: number;
  limitUsd: number;
  remainingUsd: number;
  ratio: number;
  state: BudgetState;
}

export class BudgetGuard {
  constructor(
    private readonly limitUsd: number,
    private readonly warningRatio = 0.8,
  ) {
    if (limitUsd <= 0) throw new Error("Budget limit must be positive");
    if (warningRatio <= 0 || warningRatio >= 1) throw new Error("Warning ratio must be between zero and one");
  }

  evaluate(spentUsd: number): BudgetSnapshot {
    const ratio = spentUsd / this.limitUsd;
    return {
      spentUsd,
      limitUsd: this.limitUsd,
      remainingUsd: Math.max(0, this.limitUsd - spentUsd),
      ratio,
      state: ratio >= 1 ? "suspended" : ratio >= this.warningRatio ? "warning" : "ok",
    };
  }

  assertCanStart(spentUsd: number): BudgetSnapshot {
    const snapshot = this.evaluate(spentUsd);
    if (snapshot.state === "suspended") {
      throw new Error("Monthly spending limit reached; new provider sessions are suspended");
    }
    return snapshot;
  }
}
