import type { Role } from '../auth/session.js';

const rank: Record<Role, number> = {
  guardian: 0,
  teacher: 1,
  admin: 2
};

export function maxRole(current: Role, incoming: Role): Role {
  return rank[incoming] > rank[current] ? incoming : current;
}

export function isRoleHigher(a: Role, b: Role): boolean {
  return rank[a] > rank[b];
}
