import { Router } from "express";
import { validate } from "../../middleware/validate-middleware.js";
import { authController } from "./auth.module.js";
import { loginSchema, registerSchema } from "./auth.validators.js";

const authRouter = Router();

authRouter.post("/login", validate(loginSchema), authController.login);
authRouter.post("/register", validate(registerSchema), authController.register);

export { authRouter };
