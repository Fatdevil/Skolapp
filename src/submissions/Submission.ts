export interface Submission {
  id: number;
  assignmentId: number;
  studentId: number;
  fileName: string;
  grade?: number;
}

