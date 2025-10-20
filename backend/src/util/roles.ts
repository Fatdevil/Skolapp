export type Role = 'guardian' | 'teacher' | 'admin';

export const roleRank: Record<Role, number> = {
  guardian: 0,
  teacher: 1,
  admin: 2
} as const;

export function maxRole(current: Role, incoming: Role): Role {
  return roleRank[incoming] > roleRank[current] ? incoming : current;
}

export function isRoleHigher(current: Role, incoming: Role): boolean {
  return roleRank[incoming] > roleRank[current];
}
