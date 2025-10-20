import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import AdminScreen from '../src/screens/admin/AdminScreen';
import * as AuthContext from '../src/auth/AuthContext';
import * as ToastModule from '../src/components/ToastProvider';
import { promoteUser, uploadInvites, type UserRole } from '../src/services/api';

jest.mock('../src/auth/AuthContext', () => ({
  useAuth: jest.fn()
}));

jest.mock('../src/services/api', () => {
  const actual = jest.requireActual('../src/services/api');
  return {
    ...actual,
    promoteUser: jest.fn(),
    uploadInvites: jest.fn(),
    sendTestPush: jest.fn()
  };
});

const mockUseAuth = AuthContext.useAuth as jest.MockedFunction<typeof AuthContext.useAuth>;
const mockPromoteUser = promoteUser as jest.MockedFunction<typeof promoteUser>;
const mockUploadInvites = uploadInvites as jest.MockedFunction<typeof uploadInvites>;
const mockToast = {
  show: jest.fn(),
  hide: jest.fn()
};
const useToastSpy = jest
  .spyOn(ToastModule, 'useToast')
  .mockReturnValue(mockToast as unknown as ReturnType<typeof ToastModule.useToast>);

function renderScreen() {
  return render(<AdminScreen />);
}

function buildAuthUser(role: UserRole) {
  return {
    user: { id: 'u1', email: 'admin@example.com', role },
    loading: false,
    refresh: jest.fn(),
    initiate: jest.fn(),
    loginWithToken: jest.fn(),
    logout: jest.fn()
  } as any;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue(buildAuthUser('admin'));
  mockPromoteUser.mockResolvedValue({
    ok: true,
    updated: true,
    user: { id: 'u2', email: 'teacher@example.com', role: 'admin' }
  } as any);
  mockUploadInvites.mockResolvedValue({ ok: true, count: 3 } as any);
  mockToast.show.mockReset();
  mockToast.hide.mockReset();
  useToastSpy.mockReturnValue(mockToast as unknown as ReturnType<typeof ToastModule.useToast>);
});

describe('AdminScreen', () => {
  test('allows admins to promote users and shows toast message', async () => {
    const screen = renderScreen();

    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('namn@example.com'), 'teacher@example.com');
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('role-admin'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Uppgradera'));
    });

    await waitFor(() => {
      expect(mockPromoteUser).toHaveBeenCalledWith({ email: 'teacher@example.com', role: 'admin' });
    });
    await waitFor(() => {
      expect(mockToast.show).toHaveBeenCalledWith('teacher@example.com uppgraderades till admin');
    });
  });

  test('teachers see warning and forbidden promote shows error toast', async () => {
    mockUseAuth.mockReturnValue(buildAuthUser('teacher'));
    mockPromoteUser.mockRejectedValueOnce({ response: { status: 403 } });

    const screen = renderScreen();

    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('namn@example.com'), 'guardian@example.com');
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('role-teacher'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Uppgradera'));
    });

    expect(screen.getByText(/Endast admins kan ändra roller/)).toBeTruthy();
    expect(mockPromoteUser).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(mockToast.show).toHaveBeenCalledWith('Du saknar behörighet');
    });
  });

  test('validates CSV role column and blocks invalid values', async () => {
    const screen = renderScreen();

    const textarea = screen.getByDisplayValue(/anna@example.com/);
    await act(async () => {
      fireEvent.changeText(textarea, 'email,classCode,role\nuser@example.com,3A,principal');
    });

    await act(async () => {
      fireEvent.press(screen.getByText('Förhandsgranskning'));
    });

    expect(await screen.findByText('Ogiltig roll på rad 2: principal')).toBeTruthy();
    expect(mockUploadInvites).not.toHaveBeenCalled();
  });
});
