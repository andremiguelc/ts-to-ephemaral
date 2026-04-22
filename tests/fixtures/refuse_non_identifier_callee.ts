import { Order } from "./types";

const fns: Array<(x: number) => number> = [(x) => x * 2];

function apply(order: Order): Order {
  return { ...order, total: fns[0](order.subtotal) };
}
