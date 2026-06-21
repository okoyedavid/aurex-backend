import { sessionService } from "../modules/session/session.module.js";
import { userRepository } from "../modules/users/user.repository.js";

import { asyncHandler } from "../utils/async-handler.js";
import { jsonWebService } from "../utils/jwt.js";

const protect = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : null;
  const cookieToken = req.cookies?.accessToken;
  const token = bearerToken ?? cookieToken;

  if (!token) {
    return res.status(401).json({
      message: "Authorization token is required",
    });
  }

  try {
    const decoded = jsonWebService.verifyAccessToken(token);
    const user = await userRepository.findUserById(decoded.userId);
    const userSessionId =
      decoded.userSessionId ??
      (decoded.sessionId
        ? await sessionService.getUserSessionIdFromAuthSessionId(
            decoded.sessionId,
          )
        : null);

    if (!user) {
      return res.status(401).json({
        message: "User no longer exists",
      });
    }

    const userSession = userSessionId
      ? await sessionService.getActiveUserSessionById(userSessionId)
      : null;

    if (!userSession) {
      return res.status(401).json({
        message: "Session no longer active",
      });
    }

    req.user = {
      id: user._id.toString(),
      sessionId: decoded.sessionId ?? null,
      email: user.email,
      userSessionId,
    };

    return next();
  } catch (_error) {
    return res.status(401).json({
      message: "Invalid or expired token",
    });
  }
});

export { protect };
