import { Order } from "./types";

function withFee(order: Order, fee: number): Order {
  return { ...order, total: order.subtotal + fee * 2 };
}
