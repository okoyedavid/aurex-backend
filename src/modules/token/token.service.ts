import crypto from "crypto";
import { TokenPayload } from "../../types/generic.js";
import { JsonWebService } from "../../utils/jwt.js";

type TokenServiceDependencies = { jsonWebService: JsonWebService };

export const createTokenService = ({
  jsonWebService,
}: TokenServiceDependencies) => {
  const signAccessToken = (payload: TokenPayload) =>
    jsonWebService.signAccessToken(payload);

  const signRefreshToken = (payload: TokenPayload) =>
    jsonWebService.signRefreshToken(payload);

  const verifyAccessJwt = (token: string) =>
    jsonWebService.verifyAccessToken(token);

  const verifyRefreshJwt = (token: string) =>
    jsonWebService.verifyRefreshToken(token);

  const hashToken = (token: string) =>
    crypto.createHash("sha256").update(token).digest("hex");

  const createOtpToken = () => {
    const token = crypto.randomInt(100000, 1000000).toString();

    return {
      token,
      tokenHash: hashToken(token),
    };
  };

  return {
    signAccessToken,
    signRefreshToken,
    createOtpToken,
    verifyAccessJwt,
    verifyRefreshJwt,
    hashToken,
  };
};

export type TokenService = ReturnType<typeof createTokenService>;
