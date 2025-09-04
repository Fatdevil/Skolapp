import { test, expect } from "@playwright/test";
import express from "express";
import request from "supertest";
import fs from "fs";
import path from "path";
import { assignmentsRouter } from "../src/assignments/assignmentsRouter.js";
import { submissionsRouter } from "../src/submissions/submissionsRouter.js";
import { createClass } from "../src/models/Class.js";

const app = express();
app.use(express.json());
app.use("/assignments", assignmentsRouter);
app.use("/submissions", submissionsRouter);

const server = request(app);

test("create assignment", async () => {
  const klass = createClass("Math");
  const res = await server.post("/assignments").send({ classId: klass.id, title: "Test" });
  expect(res.status).toBe(201);
  expect(res.body.title).toBe("Test");
});

test("submit and grade assignment", async () => {
  const klass = createClass("Science");
  const assignmentRes = await server
    .post("/assignments")
    .send({ classId: klass.id, title: "Lab" });
  const assignmentId = assignmentRes.body.id;

  const filePath = path.join(process.cwd(), "tests", "dummy.txt");
  fs.writeFileSync(filePath, "hej");

  const submitRes = await server
    .post(`/submissions/${assignmentId}`)
    .field("studentId", "1")
    .attach("file", filePath);
  expect(submitRes.status).toBe(201);
  const submissionId = submitRes.body.id;

  const gradeRes = await server
    .post(`/submissions/${submissionId}/grade`)
    .send({ grade: 5 });
  expect(gradeRes.status).toBe(200);
  expect(gradeRes.body.grade).toBe(5);

  fs.unlinkSync(filePath);
});

