import { jsonWebService } from "../../utils/jwt.js";
import { createTokenService } from "./token.service.js";

export const tokenService = createTokenService({
  jsonWebService: jsonWebService,
});
