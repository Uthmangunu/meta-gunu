import type { MemoryCreate, TaskSubmit } from "../../../packages/protocol/src/index.js";
import type { Pool } from "pg";

export interface MemoryRecord {
  id: string;
  fact: string;
  sourceConversationId?: string;
  sourceMessageId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskRecord extends TaskSubmit {
  status: string;
  codexThreadId?: string;
  codexTurnId?: string;
  result?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalRecord {
  id: string;
  taskId: string;
  providerRequestId: string;
  summary: string;
  status: "pending" | "accepted" | "declined" | "cancelled";
  createdAt: string;
}

export interface Store {
  monthlySpendUsd(userId: string): Promise<number>;
  listMemories(userId: string): Promise<MemoryRecord[]>;
  createMemory(userId: string, memory: MemoryCreate): Promise<MemoryRecord>;
  updateMemory(userId: string, id: string, fact: string): Promise<MemoryRecord | undefined>;
  deleteMemory(userId: string, id: string): Promise<boolean>;
  createTask(userId: string, task: TaskSubmit): Promise<{ record: TaskRecord; created: boolean }>;
  getTask(userId: string, taskId: string): Promise<TaskRecord | undefined>;
  updateTask(taskId: string, fields: Partial<Pick<TaskRecord, "status" | "codexThreadId" | "codexTurnId" | "result" | "error">>): Promise<void>;
  createApproval(taskId: string, providerRequestId: string, summary: string): Promise<ApprovalRecord>;
  listApprovals(userId: string): Promise<ApprovalRecord[]>;
  resolveApproval(userId: string, id: string, status: ApprovalRecord["status"]): Promise<ApprovalRecord | undefined>;
}

export class PostgresStore implements Store {
  constructor(private readonly pool: Pool) {}

  async monthlySpendUsd(userId: string): Promise<number> {
    const result = await this.pool.query<{ total: string }>(
      `select coalesce(sum(cost_usd), 0)::text as total from usage_events
       where user_id = $1 and created_at >= date_trunc('month', now())`,
      [userId],
    );
    return Number(result.rows[0]?.total ?? 0);
  }

  async listMemories(userId: string): Promise<MemoryRecord[]> {
    const result = await this.pool.query(
      `select id, fact, source_conversation_id, source_message_id, created_at, updated_at
       from memories where user_id = $1 and deleted_at is null order by updated_at desc`,
      [userId],
    );
    return result.rows.map(mapMemory);
  }

  async createMemory(userId: string, memory: MemoryCreate): Promise<MemoryRecord> {
    const result = await this.pool.query(
      `insert into memories (user_id, fact, source_conversation_id, source_message_id)
       values ($1, $2, $3, $4)
       returning id, fact, source_conversation_id, source_message_id, created_at, updated_at`,
      [userId, memory.fact, memory.sourceConversationId ?? null, memory.sourceMessageId ?? null],
    );
    return mapMemory(result.rows[0]);
  }

  async updateMemory(userId: string, id: string, fact: string): Promise<MemoryRecord | undefined> {
    const result = await this.pool.query(
      `update memories set fact = $3, updated_at = now()
       where user_id = $1 and id = $2 and deleted_at is null
       returning id, fact, source_conversation_id, source_message_id, created_at, updated_at`,
      [userId, id, fact],
    );
    return result.rows[0] ? mapMemory(result.rows[0]) : undefined;
  }

  async deleteMemory(userId: string, id: string): Promise<boolean> {
    const result = await this.pool.query(
      "update memories set deleted_at = now(), updated_at = now() where user_id = $1 and id = $2 and deleted_at is null",
      [userId, id],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async createTask(userId: string, task: TaskSubmit): Promise<{ record: TaskRecord; created: boolean }> {
    const inserted = await this.pool.query(
      `insert into tasks (id, user_id, conversation_id, idempotency_key, kind, prompt, workspace, status)
       values ($1, $2, $3, $4, $5, $6, $7, 'queued')
       on conflict (user_id, idempotency_key) do nothing
       returning *`,
      [task.taskId, userId, task.conversationId, task.idempotencyKey, task.kind, task.prompt, task.workspace ?? null],
    );
    if (inserted.rows[0]) return { record: mapTask(inserted.rows[0]), created: true };
    const existing = await this.pool.query("select * from tasks where user_id = $1 and idempotency_key = $2", [
      userId,
      task.idempotencyKey,
    ]);
    return { record: mapTask(existing.rows[0]), created: false };
  }

  async getTask(userId: string, taskId: string): Promise<TaskRecord | undefined> {
    const result = await this.pool.query("select * from tasks where user_id = $1 and id = $2", [userId, taskId]);
    return result.rows[0] ? mapTask(result.rows[0]) : undefined;
  }

  async updateTask(taskId: string, fields: Partial<Pick<TaskRecord, "status" | "codexThreadId" | "codexTurnId" | "result" | "error">>): Promise<void> {
    await this.pool.query(
      `update tasks set status = coalesce($2, status), codex_thread_id = coalesce($3, codex_thread_id),
       codex_turn_id = coalesce($4, codex_turn_id), result = coalesce($5, result),
       error = coalesce($6, error), updated_at = now() where id = $1`,
      [taskId, fields.status ?? null, fields.codexThreadId ?? null, fields.codexTurnId ?? null, fields.result ?? null, fields.error ?? null],
    );
  }

  async createApproval(taskId: string, providerRequestId: string, summary: string): Promise<ApprovalRecord> {
    const result = await this.pool.query(
      `insert into approvals (task_id, provider_request_id, summary, status)
       values ($1, $2, $3, 'pending')
       on conflict (task_id, provider_request_id) do update set summary = excluded.summary
       returning *`,
      [taskId, providerRequestId, summary],
    );
    return mapApproval(result.rows[0]);
  }

  async listApprovals(userId: string): Promise<ApprovalRecord[]> {
    const result = await this.pool.query(
      `select approvals.* from approvals join tasks on tasks.id = approvals.task_id
       where tasks.user_id = $1 and approvals.status = 'pending' order by approvals.created_at`,
      [userId],
    );
    return result.rows.map(mapApproval);
  }

  async resolveApproval(userId: string, id: string, status: ApprovalRecord["status"]): Promise<ApprovalRecord | undefined> {
    const result = await this.pool.query(
      `update approvals set status = $3, resolved_at = now()
       from tasks where approvals.id = $2 and approvals.task_id = tasks.id and tasks.user_id = $1
       and approvals.status = 'pending' returning approvals.*`,
      [userId, id, status],
    );
    return result.rows[0] ? mapApproval(result.rows[0]) : undefined;
  }
}

function mapMemory(row: Record<string, unknown>): MemoryRecord {
  return {
    id: String(row.id),
    fact: String(row.fact),
    ...(row.source_conversation_id ? { sourceConversationId: String(row.source_conversation_id) } : {}),
    ...(row.source_message_id ? { sourceMessageId: String(row.source_message_id) } : {}),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function mapTask(row: Record<string, unknown>): TaskRecord {
  return {
    taskId: String(row.id),
    idempotencyKey: String(row.idempotency_key),
    conversationId: String(row.conversation_id),
    kind: row.kind as TaskSubmit["kind"],
    prompt: String(row.prompt),
    ...(row.workspace ? { workspace: String(row.workspace) } : {}),
    status: String(row.status),
    ...(row.codex_thread_id ? { codexThreadId: String(row.codex_thread_id) } : {}),
    ...(row.codex_turn_id ? { codexTurnId: String(row.codex_turn_id) } : {}),
    ...(row.result ? { result: String(row.result) } : {}),
    ...(row.error ? { error: String(row.error) } : {}),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function mapApproval(row: Record<string, unknown>): ApprovalRecord {
  return {
    id: String(row.id),
    taskId: String(row.task_id),
    providerRequestId: String(row.provider_request_id),
    summary: String(row.summary),
    status: row.status as ApprovalRecord["status"],
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}
