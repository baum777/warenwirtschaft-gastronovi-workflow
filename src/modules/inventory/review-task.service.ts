import type { Actor } from "../auth/actor.js";
import { InventoryConflictError, InventoryNotFoundError } from "./errors.js";
import type { ReviewTaskActionDto } from "./inventory.schemas.js";

type ReviewTaskStatus = "open" | "in_review" | "resolved" | "dismissed";
type ReviewTaskCloseStatus = "resolved" | "dismissed";

type ReviewTaskRecord = {
  id: string;
  type: string;
  status: ReviewTaskStatus;
  resolvedAt: Date | null;
};

export type ReviewTaskDatabaseClient = {
  workflowTask: {
    findUnique(args: {
      where: {
        id: string;
      };
    }): Promise<ReviewTaskRecord | null>;
    update(args: {
      where: {
        id: string;
      };
      data: {
        status: ReviewTaskStatus;
        resolvedAt: Date | null;
      };
    }): Promise<{
      id: string;
      status: ReviewTaskStatus;
      resolvedAt: Date | null;
    }>;
  };
};

export type ReviewTaskServicePort = {
  startReview(id: string, actor: Actor): Promise<ReviewTaskActionDto>;
  resolve(id: string, actor: Actor): Promise<ReviewTaskActionDto>;
  dismiss(id: string, actor: Actor): Promise<ReviewTaskActionDto>;
};

export class ReviewTaskService implements ReviewTaskServicePort {
  public constructor(
    private readonly options: {
      db: ReviewTaskDatabaseClient;
      now?: () => Date;
    }
  ) {}

  public async startReview(id: string, _actor: Actor): Promise<ReviewTaskActionDto> {
    await this.findOpenInventoryTask(id);
    const updatedTask = await this.options.db.workflowTask.update({
      where: {
        id
      },
      data: {
        status: "in_review",
        resolvedAt: null
      }
    });

    return mapReviewTaskAction(updatedTask);
  }

  public async resolve(id: string, _actor: Actor): Promise<ReviewTaskActionDto> {
    return this.close(id, "resolved");
  }

  public async dismiss(id: string, _actor: Actor): Promise<ReviewTaskActionDto> {
    return this.close(id, "dismissed");
  }

  private async close(
    id: string,
    status: ReviewTaskCloseStatus
  ): Promise<ReviewTaskActionDto> {
    await this.findOpenInventoryTask(id);
    const resolvedAt = this.options.now?.() ?? new Date();
    const updatedTask = await this.options.db.workflowTask.update({
      where: {
        id
      },
      data: {
        status,
        resolvedAt
      }
    });

    return mapReviewTaskAction(updatedTask);
  }

  private async findOpenInventoryTask(id: string): Promise<ReviewTaskRecord> {
    const task = await this.options.db.workflowTask.findUnique({
      where: {
        id
      }
    });

    if (!task) {
      throw new InventoryNotFoundError("review task not found");
    }

    if (!task.type.startsWith("inventory.")) {
      throw new InventoryConflictError("review task is not an inventory task");
    }

    if (task.status === "resolved" || task.status === "dismissed") {
      throw new InventoryConflictError("review task is already closed");
    }

    return task;
  }
}

function mapReviewTaskAction(task: {
  id: string;
  status: ReviewTaskStatus;
  resolvedAt: Date | null;
}): ReviewTaskActionDto {
  return {
    id: task.id,
    status: task.status as ReviewTaskActionDto["status"],
    resolvedAt: task.resolvedAt?.toISOString()
  };
}
