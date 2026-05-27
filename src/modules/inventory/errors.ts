export class InventoryHttpError extends Error {
  public constructor(
    public override readonly name: string,
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
  }
}

export class InventoryNotFoundError extends InventoryHttpError {
  public constructor(message: string) {
    super("InventoryNotFound", 404, message);
  }
}

export class InventoryConflictError extends InventoryHttpError {
  public constructor(message: string) {
    super("InventoryConflict", 409, message);
  }
}
