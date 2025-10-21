import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import AdminScreen from '../src/screens/admin/AdminScreen';
import type { UserRole } from '../src/services/api';

const mockUploadInvites = jest.fn();
const mockPromoteUser = jest.fn();
const mockSendTestPush = jest.fn();
const mockGetHealth = jest.fn();
const mockGetSystemHealth = jest.fn();
const mockGetCronHealth = jest.fn();
const mockGetMetricsSummary = jest.fn();
const mockGetAuditLogs = jest.fn();
const mockUseAuth = jest.fn();
const mockToast = { show: jest.fn() };

jest.mock('../src/services/api', () => ({
  uploadInvites: (...args: unknown[]) => mockUploadInvites(...args),
  promoteUser: (...args: unknown[]) => mockPromoteUser(...args),
  sendTestPush: (...args: unknown[]) => mockSendTestPush(...args),
  getHealth: (...args: unknown[]) => mockGetHealth(...args),
  getSystemHealth: (...args: unknown[]) => mockGetSystemHealth(...args),
  getCronHealth: (...args: unknown[]) => mockGetCronHealth(...args),
  getMetricsSummary: (...args: unknown[]) => mockGetMetricsSummary(...args),
  getAuditLogs: (...args: unknown[]) => mockGetAuditLogs(...args),
  api: { defaults: { baseURL: 'https://api.example.test' } }
}));
jest.mock('../src/auth/AuthContext', () => ({
  useAuth: () => mockUseAuth()
}));
jest.mock('../src/components/ToastProvider', () => ({
  useToast: () => mockToast
}));
jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(() => Promise.resolve())
}));

describe('AdminScreen', () => {
  beforeEach(() => {
    mockUploadInvites.mockReset();
    mockPromoteUser.mockReset();
    mockSendTestPush.mockReset();
    mockToast.show.mockReset();
    mockUseAuth.mockReset();
    mockGetHealth.mockReset();
    mockGetSystemHealth.mockReset();
    mockGetCronHealth.mockReset();
    mockGetMetricsSummary.mockReset();
    mockGetAuditLogs.mockReset();

    mockGetHealth.mockResolvedValue({ status: 'ok' });
    mockGetSystemHealth.mockResolvedValue({ eventLoopDelay: 5, heapUsed: 1024 * 1024 });
    mockGetCronHealth.mockResolvedValue({
      lastRunAt: '2025-01-01T10:00:00Z',
      lastSuccessAt: '2025-01-01T10:00:00Z',
      lastError: null,
      sent24h: 3
    });
    mockGetMetricsSummary.mockResolvedValue({
      requestsPerMinute: 12,
      errorsPerMinute: 0,
      rateLimitPerMinute: 1,
      latencyMs: { p50: 45.5, p95: 120.2 },
      counters: { rbacForbidden: 2, rateLimitHit: 4, cronRemindersSent: 9 }
    });
    mockGetAuditLogs.mockResolvedValue({
      items: [
        {
          created_at: '2025-01-01T12:00:00Z',
          action: 'verify_magic',
          actor_user_id: 'user-1',
          target_user_id: 'user-2',
          meta: { ok: true }
        }
      ],
      total: 1
    });
  });

  function setUser(role: UserRole) {
    mockUseAuth.mockReturnValue({ user: { id: 'user-1', email: 'user@example.com', role }, logout: jest.fn(), refresh: jest.fn() });
  }

  test('renders promote section for admin', () => {
    setUser('admin');
    const { getByText } = render(<AdminScreen />);
    expect(getByText('Promote användare')).toBeTruthy();
  });

  test('renders promote section for teacher', () => {
    setUser('teacher');
    const { getByText } = render(<AdminScreen />);
    expect(getByText('Promote användare')).toBeTruthy();
  });

  test('blocks CSV upload when role is invalid', () => {
    setUser('admin');
    const { getByText, getByDisplayValue } = render(<AdminScreen />);
    const input = getByDisplayValue(/guardian/);
    fireEvent.changeText(input, 'email,classCode,role\nuser@example.com,3A,invalid');
    fireEvent.press(getByText('Förhandsgranskning'));
    fireEvent.press(getByText('Skicka inbjudningar'));
    expect(mockToast.show).toHaveBeenCalledWith('Ogiltig roll i CSV (tillåtna: guardian, teacher, admin)');
    expect(mockUploadInvites).not.toHaveBeenCalled();
  });

  test('submits promote request for admin', () => {
    setUser('admin');
    const { getByPlaceholderText, getAllByText, getByText } = render(<AdminScreen />);
    fireEvent.changeText(getByPlaceholderText('user@example.com'), 'teacher@example.com');
    const adminChip = getAllByText(/admin/i).pop();
    if (!adminChip) {
      throw new Error('admin chip not found');
    }
    fireEvent.press(adminChip);
    fireEvent.press(getByText('Uppdatera roll'));
    expect(mockPromoteUser).toHaveBeenCalledWith({ email: 'teacher@example.com', role: 'admin' });
  });

  test('hides observability and audit for non-admin', () => {
    setUser('teacher');
    const { queryByText } = render(<AdminScreen />);
    expect(queryByText('Observability')).toBeNull();
    expect(queryByText('Audit')).toBeNull();
  });

  test('loads and displays observability data for admin', async () => {
    setUser('admin');
    const { getByText } = render(<AdminScreen />);
    await act(async () => {
      fireEvent.press(getByText('Observability'));
    });
    await waitFor(() => expect(mockGetMetricsSummary).toHaveBeenCalled());
    await waitFor(() => {
      expect(getByText(/Requests\/min/)).toBeTruthy();
      expect(getByText(/^12$/)).toBeTruthy();
      expect(getByText(/Cron utskick/)).toBeTruthy();
    });
  });

  test('updates audit filters and reloads data', async () => {
    setUser('admin');
    const { getByText, getAllByText, getByPlaceholderText } = render(<AdminScreen />);
    await act(async () => {
      fireEvent.press(getByText('Audit'));
    });
    await waitFor(() => expect(mockGetAuditLogs).toHaveBeenCalledTimes(1));

    // Change email filter and apply
    fireEvent.changeText(getByPlaceholderText('user@example.com eller user-id'), 'actor@example.com');
    fireEvent.press(getByText('Filtrera'));

    await waitFor(() => expect(mockGetAuditLogs).toHaveBeenCalledTimes(2));
    expect(mockGetAuditLogs).toHaveBeenLastCalledWith({
      limit: 20,
      page: 1,
      action: undefined,
      email: 'actor@example.com',
      from: undefined,
      to: undefined
    });

    // Select action chip to trigger another load
    const verifyChip = getAllByText('verify_magic')[0];
    fireEvent.press(verifyChip);
    await waitFor(() => expect(mockGetAuditLogs).toHaveBeenCalledTimes(3));
    expect(mockGetAuditLogs).toHaveBeenLastCalledWith({
      limit: 20,
      page: 1,
      action: 'verify_magic',
      email: 'actor@example.com',
      from: undefined,
      to: undefined
    });
  });
});
