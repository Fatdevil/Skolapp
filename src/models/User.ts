export type Role = 'student' | 'teacher' | 'guardian';

export interface User {
  id: number;
  username: string;
  password: string;
  role: Role;
}
