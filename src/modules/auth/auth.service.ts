import { HttpError } from "../../utils/api-error.js";
import { HashService } from "../../utils/hash.js";
import { SessionService } from "../session/session.service.js";
import type { UserRepository } from "../users/user.repository.js";
import { LoginInput } from "./auth.types.js";

type AuthServiceDependencies = {
  userRepository: UserRepository;
  sessionService: SessionService;
  hashService: HashService;
  createHttpError: (message: string, statusCode: number) => HttpError;
  //   authProviderRepository: AuthProviderRepository;
  //   tokenService: TokenService;
  //   verificationService: VerificationService;
};

const createAuthService = ({
  userRepository,
  hashService,
  sessionService,
  createHttpError,
  // authProviderRepository,
  // tokenService,
  // verificationService,
}: AuthServiceDependencies) => {
  const loginUser = async ({
    email,
    password,
    requestMetadata,
    location,
  }: LoginInput) => {
    const user = await userRepository.findUserByEmailWithPassword(email);
    if (!user) throw createHttpError("Invalid Credentials!", 401);

    const isPasswordValid = await hashService.compareHash(
      password,
      user.password,
    );

    if (!isPasswordValid) {
      throw createHttpError("Invalid credentials", 401);
    }

    const { password: _password, ...safeUser } = user.toObject();

    const { accessToken, refreshToken, userSession } =
      await sessionService.createLoginSession({
        user,
        requestMetadata,
        location,
      });

    return { accessToken, refreshToken, user: safeUser, userSession };
  };

  return { loginUser };
};

export { createAuthService };
export type AuthService = ReturnType<typeof createAuthService>;
