export interface LineItem {
  productId: string;
  quantity: number;
  unitPrice: number;
}

export interface Discount {
  code: string;
  percent: number;
  minOrderValue: number;
}

export interface Order {
  id: string;
  customerId: string;
  lineItems: LineItem[];
  discount?: Discount;
  subtotal: number;
  total: number;
  status: "draft" | "confirmed" | "shipped" | "delivered" | "cancelled";
}

export interface Account {
  id: string;
  ownerName: string;
  balance: number;
  dailyWithdrawn: number;
  dailyWithdrawLimit: number;
}
