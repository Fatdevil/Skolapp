import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/ToastProvider';
import { requestPrivacyErase, requestPrivacyExport } from '../../services/api';

export default function SettingsScreen() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [lastExport, setLastExport] = useState<string | null>(null);

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await requestPrivacyExport();
      const json = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
      setLastExport(json);
      toast.show('Dataexport klar – se senaste exporten nedan');
    } catch (error) {
      toast.show('Kunde inte skapa export just nu');
    } finally {
      setExporting(false);
    }
  };

  const handleErase = async () => {
    setErasing(true);
    try {
      await requestPrivacyErase();
      toast.show('Din raderingsförfrågan är registrerad');
      await refresh();
    } catch (error) {
      toast.show('Kunde inte registrera raderingsförfrågan');
    } finally {
      setErasing(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Integritetsinställningar</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Samtycke</Text>
        <Text style={styles.value}>
          {user?.privacyConsentAt
            ? `Godkänd version ${user.privacyConsentVersion ?? 'okänd'} – ${new Date(user.privacyConsentAt).toLocaleString()}`
            : 'Inte godkänd ännu'}
        </Text>
        <Text style={styles.label}>Raderingsstatus</Text>
        <Text style={styles.value}>
          {user?.eraseRequestedAt ? `Begärd ${new Date(user.eraseRequestedAt).toLocaleString()}` : 'Ingen radering begärd'}
        </Text>
      </View>

      <TouchableOpacity
        accessibilityRole="button"
        style={[styles.button, exporting && styles.buttonDisabled]}
        onPress={handleExport}
        disabled={exporting}
      >
        {exporting ? <ActivityIndicator color="#0b1220" /> : <Text style={styles.buttonText}>Begär dataexport</Text>}
      </TouchableOpacity>

      <TouchableOpacity
        accessibilityRole="button"
        style={[styles.buttonSecondary, erasing && styles.buttonDisabled]}
        onPress={handleErase}
        disabled={erasing}
      >
        {erasing ? <ActivityIndicator color="#fde68a" /> : <Text style={styles.buttonSecondaryText}>Begär radering</Text>}
      </TouchableOpacity>

      {lastExport ? (
        <View style={styles.exportBox}>
          <Text style={styles.exportTitle}>Senaste export (JSON)</Text>
          <ScrollView horizontal style={styles.exportScroll}>
            <Text style={styles.exportText}>{lastExport}</Text>
          </ScrollView>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b1220'
  },
  content: {
    padding: 24
  },
  title: {
    color: 'white',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 16
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24
  },
  label: {
    color: '#9ca3af',
    fontSize: 14,
    marginBottom: 4
  },
  value: {
    color: '#f3f4f6',
    fontSize: 16,
    marginBottom: 12
  },
  button: {
    backgroundColor: '#3b82f6',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12
  },
  buttonSecondary: {
    backgroundColor: '#fbbf24',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24
  },
  buttonDisabled: {
    opacity: 0.6
  },
  buttonText: {
    color: '#0b1220',
    fontWeight: '700',
    fontSize: 16
  },
  buttonSecondaryText: {
    color: '#0b1220',
    fontWeight: '700',
    fontSize: 16
  },
  exportBox: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16
  },
  exportTitle: {
    color: '#93c5fd',
    fontWeight: '600',
    marginBottom: 12
  },
  exportScroll: {
    maxHeight: 200
  },
  exportText: {
    color: '#d1d5db',
    fontFamily: 'monospace'
  }
});
