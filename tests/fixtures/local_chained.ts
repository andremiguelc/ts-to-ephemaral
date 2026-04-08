import { Order } from "./types";

function computeTotal(order: Order): Order {
  const base = order.subtotal;
  const doubled = base * 2;
  return { ...order, total: doubled };
}
