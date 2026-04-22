import { Order } from "./types";

// g contains a for-loop — its body shape refuses to inline.
function g(x: number): number {
  let result = x;
  for (let i = 0; i < 5; i++) {
    result += i;
  }
  return result;
}

// f is inlineable; the refusal happens inside its body at the g(...) call.
function f(x: number): number {
  return g(x) * 2;
}

function apply(order: Order): Order {
  return { ...order, total: f(order.subtotal) };
}
