import { describe, expect, it } from "vitest";
import { BudgetGuard } from "../src/budget.js";

describe("BudgetGuard", () => {
  const guard = new BudgetGuard(25, 0.8);

  it("warns before the configured limit", () => {
    expect(guard.evaluate(20).state).toBe("warning");
  });

  it("suspends new provider work at the limit", () => {
    expect(() => guard.assertCanStart(25)).toThrow(/spending limit/i);
  });
});
