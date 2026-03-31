import { Order } from "./types";

interface Discount {
  details: { percent: number };
}

function applyDiscount(order: Order, discount: Discount): Order {
  return { ...order, total: order.subtotal - discount.details.percent };
}
