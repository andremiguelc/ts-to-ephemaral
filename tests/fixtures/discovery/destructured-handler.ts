// Destructured object parameter shape: `{ ctx, input }: InputOptions`.
// Demonstrates that destructured locals flow through into the resolved
// signature — the slice-2 addition that completes parameter resolution
// for the dominant handler shape.

interface InputOptions {
  ctx: { user: { id: number } };
  input: { memberId: number };
}

export interface PermissionResult {
  authorized: boolean;
  reason: string;
}

export function checkPermission({ ctx, input }: InputOptions): PermissionResult {
  return {
    authorized: ctx.user.id === input.memberId,
    reason: "self-edit",
  };
}
