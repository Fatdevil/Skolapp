import express from "express";
import multer from "multer";
import os from "os";
import type { Submission } from "./Submission.js";
import { assignments } from "../assignments/assignmentsRouter.js";

const router = express.Router();
const upload = multer({ dest: os.tmpdir() });

let submissions: Submission[] = [];
let nextId = 1;

// Upload a submission file
router.post('/:assignmentId', upload.single('file'), (req, res) => {
  const assignmentId = Number(req.params.assignmentId);
  const assignment = assignments.find(a => a.id === assignmentId);
  if (!assignment) return res.sendStatus(404);

  const submission: Submission = {
    id: nextId++,
    assignmentId,
    studentId: Number(req.body.studentId),
    fileName: req.file ? req.file.path : '',
  };
  submissions.push(submission);
  assignment.submissions.push(submission);
  res.status(201).json(submission);
});

// Grade a submission
router.post('/:id/grade', (req, res) => {
  const id = Number(req.params.id);
  const submission = submissions.find(s => s.id === id);
  if (!submission) return res.sendStatus(404);
  submission.grade = Number(req.body.grade);
  res.json(submission);
});

export { router as submissionsRouter, submissions };

