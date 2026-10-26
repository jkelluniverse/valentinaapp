-- Payee: a different person who covers the client's bills. Invoice emails and
-- payment reminders are also sent to them (PDF invoice attached).
ALTER TABLE "ClientProfile" ADD COLUMN "payeeName" TEXT;
ALTER TABLE "ClientProfile" ADD COLUMN "payeeEmail" TEXT;
