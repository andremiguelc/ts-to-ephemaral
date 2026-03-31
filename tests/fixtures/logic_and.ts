import { Account } from "./types";

function boundedWithdraw(account: Account, amount: number): Account {
  if (amount > 0 && amount <= account.balance) return { ...account, balance: account.balance - amount };
  return account;
}
