import { Order } from "./types";

function doNothing(order: Order): Order {
  order.total = 100;
}
