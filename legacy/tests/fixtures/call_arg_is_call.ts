import { Order } from "./types";

function h(x: number): number { return x + 1; }
function g(x: number): number { return x * 2; }
function f(x: number): number { return x - 3; }

function apply(order: Order): Order {
  return { ...order, total: f(g(h(order.subtotal)) + 1) };
}
