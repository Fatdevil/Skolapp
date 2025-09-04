import type { Assignment } from "../assignments/Assignment.js";

export interface Class {
  id: number;
  name: string;
  assignments: Assignment[];
}

export const classes: Class[] = [];
let nextId = 1;

export function createClass(name: string): Class {
  const newClass: Class = { id: nextId++, name, assignments: [] };
  classes.push(newClass);
  return newClass;
}

export function addAssignmentToClass(classId: number, assignment: Assignment) {
  const klass = classes.find(c => c.id === classId);
  if (klass) {
    klass.assignments.push(assignment);
  }
}

