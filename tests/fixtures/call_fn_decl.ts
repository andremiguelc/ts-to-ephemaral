import { Order } from "./types";

// Phase 2 target: named function declaration with a single return.
function doubleIt(x: number): number {
  return x * 2;
}

function doubleTotal(order: Order): Order {
  return { ...order, total: doubleIt(order.subtotal) };
}
