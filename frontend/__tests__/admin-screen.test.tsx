import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import AdminScreen from '../src/screens/admin/AdminScreen';
import type { UserRole } from '../src/services/api';

const mockUploadInvites = jest.fn();
const mockPromoteUser = jest.fn();
const mockSendTestPush = jest.fn();
const mockUseAuth = jest.fn();
const mockToast = { show: jest.fn() };

jest.mock('../src/services/api', () => ({
  uploadInvites: (...args: unknown[]) => mockUploadInvites(...args),
  promoteUser: (...args: unknown[]) => mockPromoteUser(...args),
  sendTestPush: (...args: unknown[]) => mockSendTestPush(...args)
}));
jest.mock('../src/auth/AuthContext', () => ({
  useAuth: () => mockUseAuth()
}));
jest.mock('../src/components/ToastProvider', () => ({
  useToast: () => mockToast
}));

describe('AdminScreen', () => {
  beforeEach(() => {
    mockUploadInvites.mockReset();
    mockPromoteUser.mockReset();
    mockSendTestPush.mockReset();
    mockToast.show.mockReset();
    mockUseAuth.mockReset();
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
});
