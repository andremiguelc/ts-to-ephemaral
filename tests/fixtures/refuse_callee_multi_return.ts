import { Order } from "./types";

// then-branch is a block with more than just a return — not recognized
// as a guard, so the whole callee body refuses to inline.
function multi(x: number): number {
  if (x > 0) {
    const y = x * 2;
    return y;
  }
  return x;
}

function apply(order: Order): Order {
  return { ...order, total: multi(order.subtotal) };
}
