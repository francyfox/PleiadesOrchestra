-- Ledger unit micro-USD -> nano-USD (1 TR = 1e9).
UPDATE `credit_ledger` SET `amount` = `amount` * 1000;
