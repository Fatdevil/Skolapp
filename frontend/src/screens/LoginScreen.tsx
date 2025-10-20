import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { getCapabilities } from '../services/api';
import { useToast } from '../components/ToastProvider';

type Stage = 'request' | 'verify';

export default function LoginScreen() {
  const { initiate, loginWithToken } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [classCode, setClassCode] = useState('3A');
  const [tokenInput, setTokenInput] = useState('');
  const [devToken, setDevToken] = useState('');
  const [stage, setStage] = useState<Stage>('request');
  const [caps, setCaps] = useState({ bankid: false, magic: true });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setCaps(await getCapabilities());
      } catch {
        // ignore capabilities fetch failures in login
      }
    })();
  }, []);

  const handleInitiate = async () => {
    if (!email || !classCode) {
      toast.show('Fyll i både e-post och klasskod');
      return;
    }
    setLoading(true);
    try {
      const res = await initiate(email.trim(), classCode.trim());
      if (res.token) {
        setDevToken(res.token);
      }
      setStage('verify');
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 404) {
        toast.show('Klasskod hittades inte');
      } else {
        toast.show('Kunde inte skicka magic link');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    const token = tokenInput.trim() || devToken.trim();
    if (!token) {
      toast.show('Klistra in token från e-posten');
      return;
    }
    setLoading(true);
    try {
      await loginWithToken(token);
    } catch {
      // toast already shown in context
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.c}>
      <Text style={styles.t}>SkolApp</Text>
      {stage === 'request' ? (
        <>
          <Text style={styles.l}>E‑post</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="namn@example.com"
            placeholderTextColor="#6b7280"
            style={styles.i}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Text style={styles.l}>Klasskod</Text>
          <TextInput
            value={classCode}
            onChangeText={setClassCode}
            placeholder="t.ex. 3A"
            placeholderTextColor="#6b7280"
            style={styles.i}
            autoCapitalize="characters"
          />
          <TouchableOpacity style={[styles.b, loading && styles.disabled]} onPress={handleInitiate} disabled={loading}>
            <Text style={styles.bt}>{loading ? 'Skickar…' : 'Skicka magic link'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.b, styles.secondary, !caps.bankid && styles.disabled]}
            disabled={!caps.bankid}
            onPress={() => toast.show('BankID är inte aktiverat i denna miljö.')}
          >
            <Text style={styles.bt}>Logga in med BankID (förberett)</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.l}>Klistra in token</Text>
          <TextInput
            value={tokenInput}
            onChangeText={setTokenInput}
            placeholder="token"
            placeholderTextColor="#6b7280"
            style={styles.i}
            autoCapitalize="none"
          />
          {devToken ? <Text style={styles.hint}>Pilot-token: {devToken}</Text> : null}
          <TouchableOpacity style={[styles.b, loading && styles.disabled]} onPress={handleVerify} disabled={loading}>
            <Text style={styles.bt}>{loading ? 'Verifierar…' : 'Verifiera & logga in'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.b, styles.secondary]} onPress={() => setStage('request')}>
            <Text style={styles.bt}>Tillbaka</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#0b1220' },
  t: { color: 'white', fontSize: 28, fontWeight: '800', marginBottom: 16, textAlign: 'center' },
  l: { color: '#9ca3af', marginTop: 8 },
  i: {
    backgroundColor: '#111827',
    color: 'white',
    width: '100%',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#374151',
    marginTop: 6
  },
  b: {
    backgroundColor: '#3b82f6',
    padding: 14,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    marginTop: 12
  },
  bt: { color: 'white', fontWeight: '700' },
  secondary: { backgroundColor: '#1f2937' },
  disabled: { opacity: 0.6 },
  hint: { color: '#93c5fd', marginTop: 8, textAlign: 'center' }
});