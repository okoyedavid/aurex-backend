import type { HttpError } from "../../utils/api-error.js";
import type { BusinessInviteRepository } from "../business-invite/business-invite.repository.js";
import type { BusinessMemberRepository } from "../business-member/business-member.repository.js";
import type { Permission } from "./role.model.js";
import type { RoleRepository } from "./role.repository.js";
import type { UpdateCustomRoleInput } from "./role.types.js";

type CreateRoleServiceDependencies = {
  roleRepository: RoleRepository;
  businessMemberRepository: BusinessMemberRepository;
  businessInviteRepository: BusinessInviteRepository;
  createHttpError: (message: string, statusCode: number) => HttpError;
};

type PopulatedRole = {
  permissions?: string[];
  deniedPermissions?: string[];
};

const effectivePermissions = (
  permissions: readonly string[],
  deniedPermissions: readonly string[],
) => {
  const denied = new Set(deniedPermissions);
  return permissions.filter((permission) => !denied.has(permission));
};

const isDuplicateKeyError = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === 11000;

const createRoleKey = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

export const createRoleService = ({
  roleRepository,
  businessMemberRepository,
  businessInviteRepository,
  createHttpError,
}: CreateRoleServiceDependencies) => {
  const getActorPermissionState = async (
    businessId: string,
    userId: string,
  ) => {
    const membership =
      await businessMemberRepository.findActiveMembershipByBusinessAndUser(
        businessId,
        userId,
      );

    if (!membership) {
      throw createHttpError("Active business membership is required", 403);
    }

    const role = membership.roleId as unknown as PopulatedRole;
    const permissions = new Set(
      effectivePermissions(
        role.permissions ?? [],
        role.deniedPermissions ?? [],
      ),
    );

    return { permissions };
  };

  const assertDeniedPermissionsAreGranted = (
    permissions: readonly Permission[],
    deniedPermissions: readonly Permission[],
  ) => {
    const grants = new Set(permissions);

    if (deniedPermissions.some((permission) => !grants.has(permission))) {
      throw createHttpError(
        "Denied permissions must also be present in the role permissions",
        400,
      );
    }
  };

  const assertActorCanDefinePermissions = async ({
    businessId,
    userId,
    permissions,
    deniedPermissions,
  }: {
    businessId: string;
    userId: string;
    permissions: Permission[];
    deniedPermissions: Permission[];
  }) => {
    assertDeniedPermissionsAreGranted(permissions, deniedPermissions);
    const actor = await getActorPermissionState(businessId, userId);
    const requested = effectivePermissions(permissions, deniedPermissions);

    if (requested.some((permission) => !actor.permissions.has(permission))) {
      throw createHttpError(
        "You cannot grant permissions you do not have",
        403,
      );
    }
  };

  const listRoles = async ({
    businessId,
    page,
    limit,
  }: {
    businessId: string;
    page: number;
    limit: number;
  }) => {
    const { items, total } = await roleRepository.paginateRolesForBusiness({
      businessId,
      page,
      limit,
    });

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  };

  const listAssignableRoles = async ({
    businessId,
    userId,
    page,
    limit,
  }: {
    businessId: string;
    userId: string;
    page: number;
    limit: number;
  }) => {
    const [{ permissions: actorPermissions }, { items, total }] =
      await Promise.all([
        getActorPermissionState(businessId, userId),
        roleRepository.paginateAssignableRolesForBusiness({
          businessId,
          page,
          limit,
        }),
      ]);
    const actorCanAssign = actorPermissions.has("roles:assign");
    const assignableItems = items.map((role) => {
        const targetPermissions = effectivePermissions(
          role.permissions ?? [],
          role.deniedPermissions ?? [],
        );
        const canAssign =
          actorCanAssign &&
          targetPermissions.every((permission) =>
            actorPermissions.has(permission),
          );

        return {
          ...role.toJSON(),
          requiresApproval: !canAssign,
        };
    });

    return {
      items: assignableItems,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  };

  const getRole = async (businessId: string, roleId: string) => {
    const role = await roleRepository.findAssignableRoleById(roleId, businessId);

    if (!role) {
      throw createHttpError("Role not found", 404);
    }

    return { role };
  };

  const createCustomRole = async ({
    businessId,
    userId,
    name,
    permissions,
    deniedPermissions,
  }: {
    businessId: string;
    userId: string;
    name: string;
    permissions: Permission[];
    deniedPermissions: Permission[];
  }) => {
    await assertActorCanDefinePermissions({
      businessId,
      userId,
      permissions,
      deniedPermissions,
    });

    const key = createRoleKey(name);

    if (!key) {
      throw createHttpError("Role name must contain letters or numbers", 400);
    }

    try {
      const role = await roleRepository.createRole({
        businessId,
        name,
        key,
        type: "custom",
        permissions,
        deniedPermissions,
      });
      return { role };
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw createHttpError("A custom role with this name already exists", 409);
      }

      throw error;
    }
  };

  const updateCustomRole = async ({
    businessId,
    roleId,
    userId,
    updates,
  }: {
    businessId: string;
    roleId: string;
    userId: string;
    updates: UpdateCustomRoleInput;
  }) => {
    const existingRole = await roleRepository.findCustomRoleById(
      businessId,
      roleId,
    );

    if (!existingRole) {
      throw createHttpError("Custom role not found", 404);
    }

    const permissions = updates.permissions ?? existingRole.permissions;
    const deniedPermissions =
      updates.deniedPermissions ?? existingRole.deniedPermissions;
    await assertActorCanDefinePermissions({
      businessId,
      userId,
      permissions: [...permissions] as Permission[],
      deniedPermissions: [...deniedPermissions] as Permission[],
    });

    const role = await roleRepository.updateCustomRole(
      businessId,
      roleId,
      updates,
    );

    if (!role) {
      throw createHttpError("Custom role not found", 404);
    }

    return { role };
  };

  const archiveCustomRole = async (businessId: string, roleId: string) => {
    const role = await roleRepository.findCustomRoleById(businessId, roleId);

    if (!role) {
      throw createHttpError("Custom role not found", 404);
    }

    const [memberCount, openInviteCount] = await Promise.all([
      businessMemberRepository.countAssignedMembersByRole(businessId, roleId),
      businessInviteRepository.countOpenInvitesByRole(businessId, roleId),
    ]);

    if (memberCount > 0 || openInviteCount > 0) {
      throw createHttpError(
        "Reassign active members and resolve open invites before deleting this role",
        409,
      );
    }

    const archivedRole = await roleRepository.archiveCustomRole(
      businessId,
      roleId,
    );
    return { role: archivedRole };
  };

  return {
    archiveCustomRole,
    createCustomRole,
    getRole,
    listAssignableRoles,
    listRoles,
    updateCustomRole,
  };
};

export type RoleService = ReturnType<typeof createRoleService>;
