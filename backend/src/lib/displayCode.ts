import { prisma } from "./prisma.js";

function prefixForRole(role: string) {
  switch (role) {
    case "technician":
      return "T";
    case "partner":
      return "P";
    case "client":
      return "C";
    default:
      return "U";
  }
}

export async function generateDisplayCode(role: string) {
  const prefix = prefixForRole(role);
  const count = await prisma.profile.count({
    where: {
      displayCode: {
        startsWith: prefix,
      },
    },
  });

  return `${prefix}${String(count + 1).padStart(5, "0")}`;
}
