-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "difference" DECIMAL(12,2),
ADD COLUMN     "receivedSettlement" DECIMAL(12,2),
ADD COLUMN     "reconciledAt" TIMESTAMP(3);
