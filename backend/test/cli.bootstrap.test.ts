import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('axios', () => {
  const get = vi.fn();
  const post = vi.fn();
  const mockAxios = {
    get,
    post,
    isAxiosError: (value: any) => Boolean(value?.isAxiosError)
  };
  return {
    default: mockAxios,
    get,
    post,
    isAxiosError: mockAxios.isAxiosError
  };
});

vi.mock('node:fs/promises', () => {
  return {
    mkdir: vi.fn(() => Promise.resolve()),
    writeFile: vi.fn(() => Promise.resolve())
  };
});

const axiosModule = await import('axios');
const axios = axiosModule.default as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};
const fsModule = await import('node:fs/promises');
const { mkdir, writeFile } = fsModule as unknown as {
  mkdir: ReturnType<typeof vi.fn>;
  writeFile: ReturnType<typeof vi.fn>;
};
const { main } = await import('../scripts/bootstrap-admin.js');

describe('bootstrap-admin CLI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_BOOTSTRAP_TOKEN = 'test-token';
    process.env.API_BASE_URL = 'http://api.example.test';
    process.env.SMOKE_ADMIN_EMAIL = 'admin@example.com';
    process.argv = ['node', '/tmp/bootstrap-admin.ts'];
  });

  it('returns success immediately when status reports an existing admin', async () => {
    axios.get.mockResolvedValue({ data: { hasAdmin: true, count: 1 } });

    const exitCode = await main();

    expect(exitCode).toBe(0);
    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(axios.post).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('bootstraps an admin when missing and persists the cookie', async () => {
    axios.get.mockResolvedValue({ data: { hasAdmin: false, count: 0 } });
    axios.post.mockResolvedValue({
      status: 200,
      data: { ok: true },
      headers: { 'set-cookie': ['sid=abc123; Path=/; HttpOnly'] }
    });

    const exitCode = await main();

    expect(exitCode).toBe(0);
    expect(axios.post).toHaveBeenCalledWith(
      'http://api.example.test/admin/bootstrap',
      { email: 'admin@example.com', secret: 'test-token' },
      expect.objectContaining({ headers: expect.any(Object) })
    );
    expect(mkdir).toHaveBeenCalled();
    expect(writeFile).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('sid=abc123'), 'utf8');
  });

  it('treats a 409 response as a success', async () => {
    axios.get.mockResolvedValue({ data: { hasAdmin: false, count: 0 } });
    axios.post.mockResolvedValue({ status: 409, data: { error: 'exists' }, headers: {} });

    const exitCode = await main();

    expect(exitCode).toBe(0);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('propagates errors from failed bootstrap attempts', async () => {
    axios.get.mockResolvedValue({ data: { hasAdmin: false, count: 0 } });
    axios.post.mockResolvedValue({ status: 500, data: { error: 'boom' }, headers: {} });

    await expect(main()).rejects.toThrow(/Bootstrap misslyckades/);
    expect(writeFile).not.toHaveBeenCalled();
  });
});
