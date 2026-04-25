import { Account } from "./types";

function guardNegative(account: Account, amount: number): Account {
  if (amount < 0) return account;
  return { ...account, balance: account.balance + amount };
}
