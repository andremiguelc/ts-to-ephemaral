import { Order } from "./types";

// Phase 2 target: arrow function with a block body containing a single return.
const doubleIt = (x: number): number => {
  return x * 2;
};

function doubleTotal(order: Order): Order {
  return { ...order, total: doubleIt(order.subtotal) };
}
