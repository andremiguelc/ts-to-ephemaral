import { Account } from "./types";

const DAILY_LIMIT = 1000;

function setLimit(account: Account): Account {
  return { ...account, dailyWithdrawLimit: DAILY_LIMIT };
}
