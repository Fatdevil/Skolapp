import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import App from '../App';

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
    whoami: jest.fn(),
    getCapabilities: jest.fn(),
    getEvents: jest.fn(),
    deleteEvent: jest.fn(),
    registerDevice: jest.fn(),
    getPrivacyPolicy: jest.fn(),
    submitPrivacyConsent: jest.fn(),
    requestPrivacyExport: jest.fn(),
    requestPrivacyErase: jest.fn()
  };
});

import * as api from '../src/services/api';

const mockWhoami = api.whoami as jest.MockedFunction<typeof api.whoami>;
const mockGetCapabilities = api.getCapabilities as jest.MockedFunction<typeof api.getCapabilities>;
const mockGetEvents = api.getEvents as jest.MockedFunction<typeof api.getEvents>;
const mockDeleteEvent = api.deleteEvent as jest.MockedFunction<typeof api.deleteEvent>;
const mockRegisterDevice = api.registerDevice as jest.MockedFunction<typeof api.registerDevice>;
const mockRequestExport = api.requestPrivacyExport as jest.MockedFunction<typeof api.requestPrivacyExport>;
const mockRequestErase = api.requestPrivacyErase as jest.MockedFunction<typeof api.requestPrivacyErase>;
const mockGetPolicy = api.getPrivacyPolicy as jest.MockedFunction<typeof api.getPrivacyPolicy>;
const mockSubmitConsent = api.submitPrivacyConsent as jest.MockedFunction<typeof api.submitPrivacyConsent>;

describe('Privacy flows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCapabilities.mockResolvedValue({ bankid: false, magic: true });
    mockGetEvents.mockResolvedValue([] as any);
    mockDeleteEvent.mockResolvedValue({ ok: true } as any);
    mockRegisterDevice.mockResolvedValue({ ok: true } as any);
    mockGetPolicy.mockResolvedValue({ version: 1, text: 'Policy text' });
    mockSubmitConsent.mockResolvedValue({ ok: true, consent: { version: 1, at: '2025-01-01T12:00:00Z' } });
  });

  test('prompts for consent and submits approval', async () => {
    mockWhoami
      .mockResolvedValueOnce({ user: { id: 'u1', email: 'user@example.com', role: 'guardian', privacyConsentAt: null } })
      .mockResolvedValue({
        user: { id: 'u1', email: 'user@example.com', role: 'guardian', privacyConsentAt: '2025-01-01T12:00:00Z' }
      });
    mockGetPolicy.mockResolvedValue({ version: 3, text: 'Policy text' });
    mockSubmitConsent.mockResolvedValue({ ok: true, consent: { version: 3, at: '2025-01-01T12:00:00Z' } });

    const screen = render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Integritet & samtycke')).toBeTruthy();
    });
    fireEvent.press(screen.getByText('Godkänn och fortsätt'));

    await waitFor(() => {
      expect(mockSubmitConsent).toHaveBeenCalledWith(3);
    });
    const calendarTabs = await screen.findAllByText('Kalender');
    expect(calendarTabs.length).toBeGreaterThan(0);
  });

  test('settings screen triggers export and erase actions', async () => {
    mockWhoami.mockResolvedValue({
      user: {
        id: 'u-settings',
        email: 'settings@example.com',
        role: 'guardian',
        privacyConsentAt: '2025-01-01T12:00:00Z',
        privacyConsentVersion: 2
      }
    });
    mockRequestExport.mockResolvedValue({ foo: 'bar' });
    mockRequestErase.mockResolvedValue({ ok: true, queueId: 1 });

    const screen = render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Inställningar')).toBeTruthy();
    });
    fireEvent.press(screen.getByText('Inställningar'));

    fireEvent.press(screen.getByText('Begär dataexport'));
    await waitFor(() => {
      expect(mockRequestExport).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByText('Senaste export (JSON)')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Begär radering'));
    await waitFor(() => {
      expect(mockRequestErase).toHaveBeenCalled();
    });
  });
});
