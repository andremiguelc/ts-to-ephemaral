import { Account } from "./types";

function guardNonPositive(account: Account, amount: number): Account {
  if (amount <= 0) return account;
  return { ...account, balance: account.balance + amount };
}
