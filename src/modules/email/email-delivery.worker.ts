import { BusinessInviteRepository } from "../business-invite/business-invite.repository.js";
import { UserRepository } from "../users/user.repository.js";
import { EmailService } from "./email.service.js";

type CreateEmailDeliveryWorkerDependencies = {
  emailService: EmailService;
  businessInviteRepository: BusinessInviteRepository;
  userRepository: UserRepository;
  intervalMs: number;
  maxAttempts: number;
};

const createEmailDeliveryWorker = ({
  emailService,
  businessInviteRepository,
  intervalMs,
  maxAttempts,
  userRepository,
}: CreateEmailDeliveryWorkerDependencies) => {
  let timer: NodeJS.Timeout | null = null;
  let tickInProgress = false;

  let stopped = true;

  const minIdleDelayMs = intervalMs;
  const maxIdleDelayMs = 30_000;

  let currentDelayMs = minIdleDelayMs;

  const addJitter = (delayMs: number) => {
    const jitter = Math.floor(Math.random() * 500);
    return delayMs + jitter;
  };

  const scheduleNextTick = (delayMs: number) => {
    if (stopped) return;
    if (timer) return;

    timer = setTimeout(() => {
      timer = null;
      void tick();
    }, addJitter(delayMs));
    timer.unref();
  };

  const processNextDelivery = async () => {
    // findOneAndUpdate makes claiming atomic, so two server instances cannot
    // process the same employee at the same time.
    const invite = await businessInviteRepository.claimNextDelivery();
    if (!invite) return false;

    const user = await userRepository.findUserByEmail(invite.email);

    const inviteId = invite.id;
    const attemptedAt = new Date();

    try {
      if (!invite.businessId || !invite.roleId || !invite.invitedByUserId) {
        throw new Error("Invite is missing required populated references");
      }

      const resolution = await emailService.sendBusinessInviteEmail({
        // to: invite.email,
        to: "okoyedav7@gmail.com",
        recipientName: user ? user.name : null,
        inviterName: invite.invitedByUserId.name,
        businessName: invite.businessId.name,
        roleName: invite.roleId.name,
        inviteUrl: "https://aurex.okoyedavid.com/dashboard/invites",
        expiresAt: invite.expiresAt,
      });

      if (
        ["console", "resend"].includes(resolution.provider) &&
        resolution.id
      ) {
        await businessInviteRepository.updateDeliveryResult(inviteId, {
          $set: {
            emailDeliveryStatus: "sent",
            emailDeliveredAt: new Date(),
          },
          $unset: {
            emailFailureReason: 1,
            emailProcessingStartedAt: 1,
            nextDeliveryAttempt: 1,
          },
        });
      }
    } catch (error) {
      const exhausted = invite.emailDeliveryAttempts >= maxAttempts;
      await businessInviteRepository.updateDeliveryResult(inviteId, {
        $set: {
          emailDeliveryStatus: exhausted ? "exhausted" : "retrying",
          emailFailureReason:
            error instanceof Error ? error.message : "Email Delivery failed",
          lastEmailAttemptAt: attemptedAt,
          ...(!exhausted && {
            nextDeliveryAttempt: new Date(Date.now() + 60_000),
          }),
        },
        $unset: {
          emailProcessingStartedAt: 1,
        },
      });
    }

    return true;
  };

  const tick = async () => {
    if (tickInProgress) return;
    tickInProgress = true;
    try {
      const processedInvite = await processNextDelivery();

      if (processedInvite) {
        currentDelayMs = minIdleDelayMs;
      } else {
        currentDelayMs = Math.min(currentDelayMs * 2, maxIdleDelayMs);
      }
    } catch (error) {
      console.error("Business invitation delivery worker failed", error);
    } finally {
      tickInProgress = false;
      scheduleNextTick(currentDelayMs);
    }
  };

  const start = () => {
    if (timer || !emailService.provider) return;
    stopped = false;
    currentDelayMs = minIdleDelayMs;

    void tick();
  };

  const stop = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  return { processNextDelivery, start, stop };
};

export { createEmailDeliveryWorker };
