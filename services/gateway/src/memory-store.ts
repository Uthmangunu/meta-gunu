import type { MemoryCreate, TaskSubmit } from "../../../packages/protocol/src/index.js";
import type { ApprovalRecord, MemoryRecord, Store, TaskRecord } from "./store.js";

export class InMemoryStore implements Store {
  spendUsd = 0;
  private readonly memories = new Map<string, MemoryRecord & { userId: string }>();
  private readonly tasks = new Map<string, TaskRecord & { userId: string }>();
  private readonly approvals = new Map<string, ApprovalRecord>();

  async monthlySpendUsd(): Promise<number> {
    return this.spendUsd;
  }

  async listMemories(userId: string): Promise<MemoryRecord[]> {
    return [...this.memories.values()].filter((memory) => memory.userId === userId);
  }

  async createMemory(userId: string, memory: MemoryCreate): Promise<MemoryRecord> {
    const now = new Date().toISOString();
    const record: MemoryRecord & { userId: string } = {
      id: crypto.randomUUID(),
      fact: memory.fact,
      ...(memory.sourceConversationId ? { sourceConversationId: memory.sourceConversationId } : {}),
      ...(memory.sourceMessageId ? { sourceMessageId: memory.sourceMessageId } : {}),
      createdAt: now,
      updatedAt: now,
      userId,
    };
    this.memories.set(record.id, record);
    return record;
  }

  async updateMemory(userId: string, id: string, fact: string): Promise<MemoryRecord | undefined> {
    const existing = this.memories.get(id);
    if (!existing || existing.userId !== userId) return undefined;
    const updated = { ...existing, fact, updatedAt: new Date().toISOString() };
    this.memories.set(id, updated);
    return updated;
  }

  async deleteMemory(userId: string, id: string): Promise<boolean> {
    const existing = this.memories.get(id);
    return existing?.userId === userId ? this.memories.delete(id) : false;
  }

  async createTask(userId: string, task: TaskSubmit): Promise<{ record: TaskRecord; created: boolean }> {
    const existing = [...this.tasks.values()].find(
      (candidate) => candidate.userId === userId && candidate.idempotencyKey === task.idempotencyKey,
    );
    if (existing) return { record: existing, created: false };
    const now = new Date().toISOString();
    const record: TaskRecord & { userId: string } = {
      ...task,
      status: "queued",
      createdAt: now,
      updatedAt: now,
      userId,
    };
    this.tasks.set(task.taskId, record);
    return { record, created: true };
  }

  async getTask(userId: string, taskId: string): Promise<TaskRecord | undefined> {
    const task = this.tasks.get(taskId);
    return task?.userId === userId ? task : undefined;
  }

  async updateTask(taskId: string, fields: Partial<Pick<TaskRecord, "status" | "codexThreadId" | "codexTurnId" | "result" | "error">>): Promise<void> {
    const task = this.tasks.get(taskId);
    if (task) this.tasks.set(taskId, { ...task, ...fields, updatedAt: new Date().toISOString() });
  }

  async createApproval(taskId: string, providerRequestId: string, summary: string): Promise<ApprovalRecord> {
    const existing = [...this.approvals.values()].find(
      (approval) => approval.taskId === taskId && approval.providerRequestId === providerRequestId,
    );
    if (existing) return existing;
    const approval: ApprovalRecord = {
      id: crypto.randomUUID(),
      taskId,
      providerRequestId,
      summary,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    this.approvals.set(approval.id, approval);
    return approval;
  }

  async listApprovals(userId: string): Promise<ApprovalRecord[]> {
    return [...this.approvals.values()].filter(
      (approval) => this.tasks.get(approval.taskId)?.userId === userId && approval.status === "pending",
    );
  }

  async resolveApproval(userId: string, id: string, status: ApprovalRecord["status"]): Promise<ApprovalRecord | undefined> {
    const approval = this.approvals.get(id);
    if (!approval || approval.status !== "pending" || this.tasks.get(approval.taskId)?.userId !== userId) return undefined;
    const updated = { ...approval, status };
    this.approvals.set(id, updated);
    return updated;
  }
}
