import "dotenv/config";
import mongoose from "mongoose";
import { Role, systemRolePermissions } from "../src/modules/role/role.model";

import { BusinessMember } from "../src/modules/business-member/business-member.model";

const systemRoles = [
  {
    name: "Owner",
    key: "owner",
    type: "system",
  },
  {
    name: "Admin",
    key: "admin",
    type: "system",
  },
  {
    name: "Contributor",
    key: "contributor",
    type: "system",
  },
  {
    name: "Finance Manager",
    key: "finance_manager",
    type: "system",
  },
  {
    name: "Accountant",
    key: "accountant",
    type: "system",
  },
  {
    name: "Viewer",
    key: "viewer",
    type: "system",
  },
] as const;

async function seedSystemRoles() {
  const mongoUri = process.env.MONGO_URI;

  const roleId = "6a432ab56ca5c52849396ff8";

  if (!mongoUri) {
    throw new Error("MONGO_URI is required");
  }

  await mongoose.connect(mongoUri);

  for (const role of systemRoles) {
    await Role.updateOne(
      {
        businessId: null,
        key: role.key,
        type: "system",
      },
      {
        $set: {
          name: role.name,
          key: role.key,
          type: "system",
          businessId: null,
          permissions: systemRolePermissions[role.key],
          status: "active",
        },
      },
      {
        upsert: true,
      },
    );
  }

  console.log(`Seeded system roles for business`);
}

seedSystemRoles()
  .catch((error) => {
    console.error("Failed to seed system roles:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
