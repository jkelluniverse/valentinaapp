import type { PaymentProvider } from "./types";
import { SquarePaymentProvider } from "./square";

// The factory — swapping providers is an env change (CLAUDE-BILLING Rule 0.4).
export function getPaymentProvider(): PaymentProvider {
  switch (process.env.PAYMENT_PROVIDER ?? "square") {
    case "square":
      return new SquarePaymentProvider();
    default:
      throw new Error(`unknown payment provider: ${process.env.PAYMENT_PROVIDER}`);
  }
}
