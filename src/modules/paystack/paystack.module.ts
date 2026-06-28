import { env } from "../../config/env.js";
import { createPaystackController } from "./paystack.controller.js";
import { createPaystackService } from "./paystack.service.js";

export const paystackService = createPaystackService({
  baseUrl: env.PAYSTACK_BASE_URL,
  secretKey: env.PAYSTACK_SECRET_KEY,
  verificationMode: env.PAYSTACK_VERIFICATION_MODE,
  testBankCode: env.PAYSTACK_TEST_BANK_CODE,
});

export const paystackController = createPaystackController({
  paystackService,
});
