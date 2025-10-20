import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type ToastContextValue = {
  show: (message: string) => void;
  hide: () => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [message, setMessage] = useState<string | null>(null);

  const show = useCallback((text: string) => {
    setMessage(text);
  }, []);

  const hide = useCallback(() => {
    setMessage(null);
  }, []);

  const value = useMemo(() => ({ show, hide }), [show, hide]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {message ? (
        <View style={styles.toast} accessibilityLiveRegion="polite">
          <Text style={styles.message}>{message}</Text>
          <TouchableOpacity onPress={hide} accessibilityRole="button">
            <Text style={styles.dismiss}>Stäng</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
};

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(30, 41, 59, 0.95)',
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4
  },
  message: {
    color: 'white',
    flex: 1,
    marginRight: 12,
    fontSize: 15
  },
  dismiss: {
    color: '#93c5fd',
    fontWeight: '600'
  }
});
