import { Order } from "./types";

class Calculator {
  compute(x: number): number { return x * 2; }
}

const calc = new Calculator();

function apply(order: Order): Order {
  return { ...order, total: calc.compute(order.subtotal) };
}
