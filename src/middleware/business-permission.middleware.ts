import type { NextFunction, Request, Response } from "express";
import { businessMemberRepository } from "../modules/business-member/business-member.repository.js";
import type { Permission } from "../modules/role/role.model.js";
import { asyncHandler } from "../utils/async-handler.js";

type PopulatedRole = {
  permissions?: string[];
  deniedPermissions?: string[];
};

// API routes authorize once before entering a service. Internal service calls made
// during business creation bypass this guard because the caller is the new owner.
const requireBusinessPermission = (permission: Permission) =>
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const params = req.validatedParams as { businessId?: string } | undefined;
    const businessId = params?.businessId;

    if (!req.user?.id || !businessId) {
      return res.status(401).json({
        message: "Authentication and a business id are required",
        success: false,
      });
    }

    const membership =
      await businessMemberRepository.findActiveMembershipByBusinessAndUser(
        businessId,
        req.user.id,
      );

    if (!membership) {
      return res.status(403).json({
        message: "You are not an active member of this business",
        success: false,
      });
    }

    const role = membership.roleId as unknown as PopulatedRole;
    const isDenied = role.deniedPermissions?.includes(permission) ?? false;
    const isAllowed = role.permissions?.includes(permission) ?? false;

    // Explicit denials win, which allows custom roles to remove an inherited grant.
    if (isDenied || !isAllowed) {
      return res.status(403).json({
        message: `Missing required permission: ${permission}`,
        success: false,
      });
    }

    return next();
  });

export { requireBusinessPermission };
