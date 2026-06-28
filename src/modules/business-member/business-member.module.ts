import { createHttpError } from "../../utils/api-error.js";
import { businessMemberRepository } from "./business-member.repository.js";
import { createBusinessMemberController } from "./business-member.controller.js";
import { createBusinessMemberService } from "./business-member.service.js";

const businessMemberService = createBusinessMemberService({
  businessMemberRepository,
  createHttpError,
});

const businessMemberController = createBusinessMemberController({
  businessMemberService,
});

export { businessMemberController, businessMemberService };
