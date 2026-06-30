import { createHttpError } from "../../utils/api-error.js";
import { businessInviteRepository } from "../business-invite/business-invite.repository.js";
import { businessMemberRepository } from "../business-member/business-member.repository.js";
import { createRoleController } from "./role.controller.js";
import { roleRepository } from "./role.repository.js";
import { createRoleService } from "./role.service.js";

const roleService = createRoleService({
  roleRepository,
  businessMemberRepository,
  businessInviteRepository,
  createHttpError,
});

const roleController = createRoleController({ roleService });

export { roleController, roleService };
