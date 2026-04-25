import { Order } from "./types";

function inner(x: number): number {
  return x + 1;
}

function outer(x: number): number {
  return inner(x) * 2;
}

function applyOuter(order: Order): Order {
  return { ...order, total: outer(order.subtotal) };
}
