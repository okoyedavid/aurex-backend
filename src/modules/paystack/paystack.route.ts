import { Router } from "express";
import { paystackController } from "./paystack.module.js";
import { protect } from "../../middleware/auth.middleware.js";

const paystackRouter = Router();

paystackRouter.get("/banks", paystackController.listBanks);
paystackRouter.get(
  "/bank-account/resolve",
  protect,
  paystackController.resolveBankAccount,
);

export { paystackRouter };
