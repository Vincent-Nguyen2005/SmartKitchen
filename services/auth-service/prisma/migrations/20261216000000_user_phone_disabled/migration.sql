-- Shipper accounts: phone number and disabling by an admin. Additive.
ALTER TABLE "User" ADD COLUMN "phone" TEXT,
ADD COLUMN "disabledAt" TIMESTAMP(3);
