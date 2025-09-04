import express from "express";
import type { Assignment } from "./Assignment.js";
import { classes, addAssignmentToClass } from "../models/Class.js";

const router = express.Router();

let assignments: Assignment[] = [];
let nextId = 1;

// List all assignments
router.get('/', (_req, res) => {
  res.json(assignments);
});

// Get assignment by id
router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const assignment = assignments.find(a => a.id === id);
  if (!assignment) {
    return res.sendStatus(404);
  }
  res.json(assignment);
});

// Create new assignment
router.post('/', (req, res) => {
  const assignment: Assignment = {
    id: nextId++,
    classId: Number(req.body.classId),
    title: req.body.title,
    description: req.body.description,
    dueDate: req.body.dueDate,
    submissions: [],
  };
  assignments.push(assignment);
  addAssignmentToClass(assignment.classId, assignment);
  res.status(201).json(assignment);
});

// Update assignment
router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const assignment = assignments.find(a => a.id === id);
  if (!assignment) return res.sendStatus(404);
  assignment.title = req.body.title ?? assignment.title;
  assignment.description = req.body.description ?? assignment.description;
  assignment.dueDate = req.body.dueDate ?? assignment.dueDate;
  res.json(assignment);
});

// Delete assignment
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const index = assignments.findIndex(a => a.id === id);
  if (index === -1) return res.sendStatus(404);
  assignments.splice(index, 1);
  res.sendStatus(204);
});

export { router as assignmentsRouter, assignments };

