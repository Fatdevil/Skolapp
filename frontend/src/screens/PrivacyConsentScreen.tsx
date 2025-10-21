import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { getPrivacyPolicy, submitPrivacyConsent } from '../services/api';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/ToastProvider';

export default function PrivacyConsentScreen() {
  const { refresh } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [policy, setPolicy] = useState<{ version: number; text: string } | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await getPrivacyPolicy();
        setPolicy(data);
      } catch (error) {
        toast.show('Kunde inte ladda integritetspolicy');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [toast]);

  const handleAccept = async () => {
    if (!policy) return;
    setSubmitting(true);
    try {
      await submitPrivacyConsent(policy.version);
      toast.show('Integritetspolicyn har godkänts');
      await refresh();
    } catch (error) {
      toast.show('Kunde inte spara samtycke, försök igen');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#3b82f6" />
        <Text style={styles.loadingText}>Laddar policy…</Text>
      </View>
    );
  }

  if (!policy) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loadingText}>Ingen policy tillgänglig just nu</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Integritet & samtycke</Text>
      <Text style={styles.subtitle}>Version {policy.version}</Text>
      <ScrollView style={styles.policyBox} contentContainerStyle={{ paddingBottom: 24 }}>
        <Text style={styles.policyText}>{policy.text}</Text>
      </ScrollView>
      <TouchableOpacity
        accessibilityRole="button"
        style={[styles.button, submitting && styles.buttonDisabled]}
        onPress={handleAccept}
        disabled={submitting}
      >
        {submitting ? <ActivityIndicator color="#0b1220" /> : <Text style={styles.buttonText}>Godkänn och fortsätt</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b1220',
    paddingHorizontal: 24,
    paddingVertical: 48
  },
  title: {
    color: 'white',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8
  },
  subtitle: {
    color: '#93c5fd',
    marginBottom: 16,
    fontWeight: '600'
  },
  policyBox: {
    flex: 1,
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24
  },
  policyText: {
    color: '#d1d5db',
    fontSize: 16,
    lineHeight: 22
  },
  button: {
    backgroundColor: '#3b82f6',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center'
  },
  buttonDisabled: {
    opacity: 0.6
  },
  buttonText: {
    color: '#0b1220',
    fontWeight: '700',
    fontSize: 16
  },
  centered: {
    flex: 1,
    backgroundColor: '#0b1220',
    alignItems: 'center',
    justifyContent: 'center'
  },
  loadingText: {
    color: 'white',
    marginTop: 12
  }
});
