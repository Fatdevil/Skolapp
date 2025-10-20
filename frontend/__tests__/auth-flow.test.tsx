import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import App from '../App';
import * as api from '../src/services/api';

jest.mock('../src/services/api', () => {
  const actual = jest.requireActual('../src/services/api');
  return {
    ...actual,
    api: {
      interceptors: {
        response: {
          use: jest.fn(() => 1),
          eject: jest.fn()
        }
      }
    },
    getCapabilities: jest.fn(),
    initiateMagicLink: jest.fn(),
    verifyMagicToken: jest.fn(),
    whoami: jest.fn(),
    logout: jest.fn(),
    getEvents: jest.fn(),
    deleteEvent: jest.fn(),
    createEvent: jest.fn(),
    getMessages: jest.fn(),
    sendMessage: jest.fn(),
    registerDevice: jest.fn(),
    uploadInvites: jest.fn(),
    promoteUser: jest.fn(),
    sendTestPush: jest.fn()
  };
});

describe('AuthContext + routing', () => {
  const mockWhoami = api.whoami as jest.MockedFunction<typeof api.whoami>;
  const mockInitiate = api.initiateMagicLink as jest.MockedFunction<typeof api.initiateMagicLink>;
  const mockVerify = api.verifyMagicToken as jest.MockedFunction<typeof api.verifyMagicToken>;
  const mockGetCapabilities = api.getCapabilities as jest.MockedFunction<typeof api.getCapabilities>;
  const mockLogout = api.logout as jest.MockedFunction<typeof api.logout>;
  const mockGetEvents = api.getEvents as jest.MockedFunction<typeof api.getEvents>;
  const mockDeleteEvent = api.deleteEvent as jest.MockedFunction<typeof api.deleteEvent>;
  const mockRegisterDevice = api.registerDevice as jest.MockedFunction<typeof api.registerDevice>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCapabilities.mockResolvedValue({ bankid: false, magic: true });
    mockGetEvents.mockResolvedValue([]);
    mockDeleteEvent.mockResolvedValue({ ok: true });
    mockRegisterDevice.mockResolvedValue({ ok: true } as any);
  });

  test('bootstrap with existing session renders app tabs', async () => {
    mockWhoami.mockResolvedValue({
      user: { id: 'u1', email: 'user@example.com', role: 'guardian' }
    });

    const screen = render(<App />);

    await waitFor(() => {
      expect(screen.queryAllByText('Kalender').length).toBeGreaterThan(0);
    });
    expect(screen.queryByText('Skicka magic link')).toBeNull();
  });

  test('bootstrap 401 renders login screen', async () => {
    mockWhoami.mockRejectedValue({ response: { status: 401 } });

    const screen = render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Skicka magic link')).toBeTruthy();
    });
  });

  test('magic link verify flow logs user in', async () => {
    mockWhoami
      .mockRejectedValueOnce({ response: { status: 401 } })
      .mockResolvedValue({ user: { id: 'u2', email: 'login@example.com', role: 'guardian' } });
    mockInitiate.mockResolvedValue({ ok: true, token: 'dev-token' });
    mockVerify.mockResolvedValue({ user: { id: 'u2', email: 'login@example.com', role: 'guardian' } });

    const screen = render(<App />);

    const emailInput = await screen.findByPlaceholderText('namn@example.com');
    fireEvent.changeText(emailInput, 'login@example.com');
    const classInput = screen.getByPlaceholderText('t.ex. 3A');
    fireEvent.changeText(classInput, '3A');

    fireEvent.press(screen.getByText('Skicka magic link'));
    await waitFor(() => {
      expect(mockInitiate).toHaveBeenCalledWith('login@example.com', '3A');
    });
    await waitFor(() => {
      expect(screen.getByText('Klistra in token')).toBeTruthy();
    });

    const tokenInput = screen.getByPlaceholderText('token');
    fireEvent.changeText(tokenInput, 'dev-token');
    fireEvent.press(screen.getByText('Verifiera & logga in'));

    await waitFor(() => {
      expect(mockVerify).toHaveBeenCalledWith('dev-token');
    });
    await waitFor(() => {
      expect(screen.queryAllByText('Kalender').length).toBeGreaterThan(0);
    });
  });

  test('role gating hides admin tab for guardians and shows for teachers', async () => {
    mockWhoami.mockResolvedValue({ user: { id: 'g1', email: 'g@example.com', role: 'guardian' } });

    let screen = render(<App />);
    await waitFor(() => {
      expect(screen.queryAllByText('Kalender').length).toBeGreaterThan(0);
    });
    expect(screen.queryByText('Admin')).toBeNull();

    screen.unmount();

    mockWhoami.mockResolvedValue({ user: { id: 't1', email: 't@example.com', role: 'teacher' } });
    screen = render(<App />);
    await waitFor(() => {
      expect(screen.queryAllByText('Kalender').length).toBeGreaterThan(0);
    });
    expect(screen.getByText('Admin')).toBeTruthy();
  });

  test('logout clears session and shows login screen', async () => {
    mockWhoami.mockResolvedValue({ user: { id: 't1', email: 't@example.com', role: 'teacher' } });
    mockLogout.mockResolvedValue({ ok: true });

    const screen = render(<App />);
    await waitFor(() => {
      expect(screen.queryAllByText('Kalender').length).toBeGreaterThan(0);
    });

    fireEvent.press(screen.getByText('Logga ut'));

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled();
      expect(screen.getByText('Skicka magic link')).toBeTruthy();
    });
  });
});
