import { Order } from "./types";

const doubleIt = (x: number) => x * 2;

function doubleTotal(order: Order): Order {
  return { ...order, total: doubleIt(order.subtotal) };
}
