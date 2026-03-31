import { Order } from "./types";

function applyPercentDiscount(order: Order): Order {
  return { ...order, total: order.subtotal - order.discount.percent };
}
