import { HttpError } from "../../utils/api-error.js";
import { HashService } from "../../utils/hash.js";
import { auditEventService } from "../audit-event/audit-event.module.js";
import { SessionService } from "../session/session.service.js";
import type { UserRepository } from "../users/user.repository.js";
import type { VerificationService } from "../verification/verification.service.js";
import { LoginInput, RegisterInput } from "./auth.types.js";

type AuthServiceDependencies = {
  userRepository: UserRepository;
  sessionService: SessionService;
  hashService: HashService;
  verificationService: VerificationService;
  createHttpError: (message: string, statusCode: number) => HttpError;
  //   authProviderRepository: AuthProviderRepository;
  //   tokenService: TokenService;
  //   verificationService: VerificationService;
};

const createAuthService = ({
  userRepository,
  hashService,
  sessionService,
  verificationService,
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

  const registerUser = async ({ name, email, password }: RegisterInput) => {
    const existingUser = await userRepository.findUserByEmail(email);
    if (existingUser) {
      throw createHttpError("Email already in use", 409);
    }

    const hashedPassword = await hashService.hashValue(password);

    const user = await userRepository.createUser({
      name,
      email,
      password: hashedPassword,
    });

    try {
      await verificationService.issueVerificationToken({
        userId: user.id,
        email,
        name,
        purpose: "verify_email",
      });
    } catch (error) {
      await userRepository.deleteUserById(user.id);
      throw error;
    }

    return {
      user,
    };
  };
  return { loginUser, registerUser };
};

export { createAuthService };
export type AuthService = ReturnType<typeof createAuthService>;
