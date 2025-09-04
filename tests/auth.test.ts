// @ts-nocheck
import { test, expect } from '@playwright/test';
import request from 'supertest';
import { app } from '../src/server';

test.describe('authentication', () => {
  test('successful login returns token', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ username: 'student', password: 'password' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  test('failed login returns 401', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ username: 'student', password: 'wrong' });
    expect(res.status).toBe(401);
  });
});
