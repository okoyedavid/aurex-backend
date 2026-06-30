import { asyncHandler } from "../../utils/async-handler.js";
import type { RoleService } from "./role.service.js";
import {
  createCustomRoleSchema,
  getRoleSchema,
  listRolesSchema,
  updateCustomRoleSchema,
} from "./role.validators.js";

type CreateRoleControllerDependencies = {
  roleService: RoleService;
};

export const createRoleController = ({
  roleService,
}: CreateRoleControllerDependencies) => {
  const listRoles = asyncHandler(async (req, res) => {
    const { businessId } = listRolesSchema.shape.params.parse(
      req.validatedParams,
    );
    const query = listRolesSchema.shape.query.parse(req.validatedQuery);
    const result = await roleService.listRoles({ businessId, ...query });

    return res.status(200).json({
      data: result,
      message: "Business roles retrieved",
      success: true,
    });
  });

  const listAssignableRoles = asyncHandler(async (req, res) => {
    if (!req.user?.id) {
      return res.status(401).json({
        message: "Authentication required",
        success: false,
      });
    }

    const { businessId } = listRolesSchema.shape.params.parse(
      req.validatedParams,
    );
    const query = listRolesSchema.shape.query.parse(req.validatedQuery);
    const result = await roleService.listAssignableRoles({
      businessId,
      userId: req.user.id,
      ...query,
    });

    return res.status(200).json({
      data: result,
      message: "Assignable roles retrieved",
      success: true,
    });
  });

  const getRole = asyncHandler(async (req, res) => {
    const { businessId, roleId } = getRoleSchema.shape.params.parse(
      req.validatedParams,
    );
    const { role } = await roleService.getRole(businessId, roleId);

    return res.status(200).json({
      data: role,
      message: "Business role retrieved",
      success: true,
    });
  });

  const createCustomRole = asyncHandler(async (req, res) => {
    if (!req.user?.id) {
      return res.status(401).json({
        message: "Authentication required",
        success: false,
      });
    }

    const { businessId } = createCustomRoleSchema.shape.params.parse(
      req.validatedParams,
    );
    const body = createCustomRoleSchema.shape.body.parse(req.validatedBody);
    const { role } = await roleService.createCustomRole({
      businessId,
      userId: req.user.id,
      ...body,
    });

    return res.status(201).json({
      data: role,
      message: "Custom role created",
      success: true,
    });
  });

  const updateCustomRole = asyncHandler(async (req, res) => {
    if (!req.user?.id) {
      return res.status(401).json({
        message: "Authentication required",
        success: false,
      });
    }

    const { businessId, roleId } = updateCustomRoleSchema.shape.params.parse(
      req.validatedParams,
    );
    const updates = updateCustomRoleSchema.shape.body.parse(req.validatedBody);
    const { role } = await roleService.updateCustomRole({
      businessId,
      roleId,
      userId: req.user.id,
      updates,
    });

    return res.status(200).json({
      data: role,
      message: "Custom role updated",
      success: true,
    });
  });

  const archiveCustomRole = asyncHandler(async (req, res) => {
    const { businessId, roleId } = getRoleSchema.shape.params.parse(
      req.validatedParams,
    );
    const { role } = await roleService.archiveCustomRole(businessId, roleId);

    return res.status(200).json({
      data: role,
      message: "Custom role archived",
      success: true,
    });
  });

  return {
    archiveCustomRole,
    createCustomRole,
    getRole,
    listAssignableRoles,
    listRoles,
    updateCustomRole,
  };
};
