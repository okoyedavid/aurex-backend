import { asyncHandler } from "../../utils/async-handler.js";
import { PaystackService } from "./paystack.service.js";

export type PaystackControllerDependencies = {
  paystackService: PaystackService;
};

export const createPaystackController = ({
  paystackService,
}: PaystackControllerDependencies) => {
  const listBanks = asyncHandler(async (req, res) => {
    const { country, q, type } = req.query as {
      country?: string;
      q?: string;
      type?: string;
    };
    const banks = paystackService.listBanks({ country, q, type });

    return res.status(200).json({
      data: banks,
      message: "Banks retrieved successfully",
      success: true,
    });
  });

  const resolveBankAccount = asyncHandler(async (req, res) => {
    const { accountNumber, bankCode } = req.query as {
      accountNumber?: string;
      bankCode?: string;
    };

    if (!accountNumber || !/^\d{10}$/.test(accountNumber)) {
      return res.status(400).json({
        message: "A valid 10 digit accountNumber query parameter is required",
        success: false,
      });
    }

    if (!bankCode || !/^\d{3,6}$/.test(bankCode)) {
      return res.status(400).json({
        message: "A valid bankCode query parameter is required",
        success: false,
      });
    }

    const resolvedAccount = await paystackService.resolveBankAccount({
      accountNumber,
      bankCode,
    });

    return res.status(resolvedAccount.statusCode).json({
      data: resolvedAccount.data,
      message: "Bank account resolve response retrieved",
      result: {
        outcome: resolvedAccount.outcome,
        ...(resolvedAccount.outcome !== "verified" && {
          reason: resolvedAccount.reason,
        }),
      },
      success: resolvedAccount.outcome === "verified",
    });
  });

  return { listBanks, resolveBankAccount };
};

export type PaystackController = ReturnType<typeof createPaystackController>;
