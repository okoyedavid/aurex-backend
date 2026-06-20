import { describe, expect, it, vi } from "vitest";
import { createHttpError } from "../src/utils/api-error.js";
import {
  createVerificationService,
  type VerificationServiceDependencies,
} from "../src/modules/verification/verification.service.js";

const createTestVerificationService = () => {
  const tokenService = {
    createOtpToken: vi.fn(() => ({
      token: "123456",
      tokenHash: "hashed-123456",
    })),
    hashToken: vi.fn((token: string) => `hashed-${token}`),
  } as unknown as VerificationServiceDependencies["tokenService"];

  const emailService = {
    sendVerificationOtpEmail: vi.fn().mockResolvedValue({
      id: null,
      provider: "console",
    }),
  } as unknown as VerificationServiceDependencies["emailService"];

  const verificationRepository = {
    createVerificationToken: vi.fn().mockResolvedValue({}),
    deleteVerificationTokensForUser: vi.fn().mockResolvedValue({}),
    findActiveVerificationToken: vi.fn(),
    findVerificationTokenByHash: vi.fn(),
    markVerificationTokenUsed: vi.fn().mockResolvedValue({}),
  } as unknown as VerificationServiceDependencies["verificationRepository"];

  const userRepository = {
    findUserById: vi.fn(),
    updateUserById: vi.fn(),
  } as unknown as VerificationServiceDependencies["userRepository"];

  const service = createVerificationService({
    userRepository,
    tokenService,
    emailService,
    verificationRepository,
    createHttpError,
  });

  return {
    service,
    tokenService,
    emailService,
    verificationRepository,
    userRepository,
  };
};

describe("verificationService", () => {
  it("creates a verification token hash and emails the plain OTP", async () => {
    const { service, tokenService, emailService, verificationRepository } =
      createTestVerificationService();

    await service.issueVerificationToken({
      userId: "user-1",
      email: "ada@test.local",
      name: "Ada",
      purpose: "verify_email",
    });

    expect(
      verificationRepository.deleteVerificationTokensForUser,
    ).toHaveBeenCalledWith("user-1", "verify_email");
    expect(tokenService.createOtpToken).toHaveBeenCalledOnce();
    expect(verificationRepository.createVerificationToken).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        purpose: "verify_email",
        tokenHash: "hashed-123456",
      }),
    );
    expect(emailService.sendVerificationOtpEmail).toHaveBeenCalledWith({
      to: "ada@test.local",
      name: "Ada",
      otp: "123456",
    });
  });

  it("verifies a submitted OTP by hashing it and setting emailVerifiedAt", async () => {
    const { service, tokenService, verificationRepository, userRepository } =
      createTestVerificationService();
    const verifiedUser = {
      id: "user-1",
      email: "ada@test.local",
      emailVerifiedAt: new Date(),
    };

    vi.mocked(
      verificationRepository.findActiveVerificationToken,
    ).mockResolvedValue({
      userId: "user-1",
    });
    vi.mocked(userRepository.findUserById).mockResolvedValue({
      id: "user-1",
      email: "ada@test.local",
      emailVerifiedAt: null,
    });
    vi.mocked(userRepository.updateUserById).mockResolvedValue(verifiedUser);

    const result = await service.verifyUserToken({
      userId: "user-1",
      token: "123456",
      purpose: "verify_email",
    });

    expect(tokenService.hashToken).toHaveBeenCalledWith("123456");
    expect(
      verificationRepository.findActiveVerificationToken,
    ).toHaveBeenCalledWith("hashed-123456", "verify_email");
    expect(
      verificationRepository.markVerificationTokenUsed,
    ).toHaveBeenCalledWith("hashed-123456");
    expect(userRepository.updateUserById).toHaveBeenCalledWith("user-1", {
      emailVerifiedAt: expect.any(Date),
    });
    expect(result).toBe(verifiedUser);
  });
});
