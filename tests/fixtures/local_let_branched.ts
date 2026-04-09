import { Account } from "./types";

function conditionalDeposit(account: Account, amount: number, bonus: number): Account {
  let result = account.balance;
  if (amount > 100) {
    result = result + bonus;
  }
  return { ...account, balance: result };
}
