import { Order } from "./types";

function eightly(
  a: number, b: number, c: number, d: number,
  e: number, f: number, g: number, h: number,
): number {
  return a * b + c * d - e * f + g * h;
}

function apply(
  order: Order,
  a: number, b: number, c: number, d: number,
  e: number, f: number, g: number,
): Order {
  return { ...order, total: eightly(order.subtotal, a, b, c, d, e, f, g) };
}
