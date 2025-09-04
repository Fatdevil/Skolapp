import type { Submission } from "../submissions/Submission.js";

export interface Assignment {
  id: number;
  classId: number;
  title: string;
  description?: string;
  dueDate?: string;
  submissions: Submission[];
}

