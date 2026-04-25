import { Account } from "./types";

function safeWithdraw(account: Account, amount: number): Account {
  if (amount <= 0 || amount > account.balance) return account;
  return { ...account, balance: account.balance - amount };
}
