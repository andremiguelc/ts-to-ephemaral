import { Order } from "./types";

// Phase 1 target: arrow with expression body. Expect the call to compose
// into the caller's IR so `total` becomes `arith(mul, field(subtotal), lit(2))`,
// not an unconstrained parameter.
const doubleIt = (x: number) => x * 2;

function doubleTotal(order: Order): Order {
  return { ...order, total: doubleIt(order.subtotal) };
}
