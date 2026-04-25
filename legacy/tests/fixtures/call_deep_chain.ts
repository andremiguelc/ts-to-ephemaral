import { Order } from "./types";

function f8(x: number): number { return x + 8; }
function f7(x: number): number { return f8(x) + 7; }
function f6(x: number): number { return f7(x) + 6; }
function f5(x: number): number { return f6(x) + 5; }
function f4(x: number): number { return f5(x) + 4; }
function f3(x: number): number { return f4(x) + 3; }
function f2(x: number): number { return f3(x) + 2; }
function f1(x: number): number { return f2(x) + 1; }

function apply(order: Order): Order {
  return { ...order, total: f1(order.subtotal) };
}
