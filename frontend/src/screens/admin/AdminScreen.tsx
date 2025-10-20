import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { promoteUser, sendTestPush, uploadInvites, type UserRole } from '../../services/api';
import { useToast } from '../../components/ToastProvider';
import { useAuth } from '../../auth/AuthContext';

const roleOptions: UserRole[] = ['guardian', 'teacher', 'admin'];

export default function AdminScreen() {
  const toast = useToast();
  const { user } = useAuth();
  const [csv, setCsv] = useState('email,classCode,role\nanna@example.com,3A,guardian\n');
  const [preview, setPreview] = useState<string[][]>([]);
  const [validated, setValidated] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [promoteEmail, setPromoteEmail] = useState('');
  const [promoteRole, setPromoteRole] = useState<UserRole>('teacher');

  const canPromote = user?.role === 'admin';
  const isStaff = user?.role === 'admin' || user?.role === 'teacher';

  const allowedRolesText = useMemo(() => roleOptions.join(', '), []);

  const onPreview = () => {
    try {
      const lines = csv.trim().split(/\r?\n/);
      const rows = lines
        .map((line) => line.split(',').map((s) => s.trim()))
        .filter((row) => row.some((cell) => cell.length > 0));
      setPreview(rows);
      if (rows.length <= 1) {
        setValidated(false);
        setCsvError('CSV måste innehålla minst en data-rad.');
        return;
      }
      const headerCols = rows[0].map((col) => col.toLowerCase());
      const emailIdx = headerCols.indexOf('email');
      const classIdx = headerCols.indexOf('classcode');
      const roleIdx = headerCols.indexOf('role');
      if (emailIdx < 0 || classIdx < 0) {
        setValidated(false);
        setCsvError('Rubrik måste vara: email,classCode[,role]');
        return;
      }
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (roleIdx >= 0 && row[roleIdx]) {
          const normalized = row[roleIdx]!.toLowerCase();
          if (!roleOptions.includes(normalized as UserRole)) {
            setValidated(false);
            setCsvError(`Ogiltig roll på rad ${i + 1}: ${row[roleIdx]}`);
            return;
          }
        }
      }
      setCsvError(null);
      setValidated(true);
    } catch {
      setPreview([['Fel vid parsning']]);
      setValidated(false);
      setCsvError('Kunde inte tolka CSV');
    }
  };

  const onUpload = async () => {
    if (!validated) {
      toast.show(csvError ?? 'CSV saknar korrekta kolumner (email,classCode[,role])');
      return;
    }
    try {
      const res = await uploadInvites(csv);
      toast.show(`Skickade ${res.count} inbjudningar`);
    } catch (error: any) {
      if (error?.response?.status === 403) {
        toast.show('Du saknar behörighet');
      } else {
        toast.show('Kunde inte skicka inbjudningar');
      }
    }
  };

  const onTestPush = async () => {
    try {
      await sendTestPush({ classId: 'class-1', title: 'Testnotis', body: 'Detta är en testnotis.' });
      toast.show('Testnotis skickad');
    } catch (error: any) {
      if (error?.response?.status === 403) {
        toast.show('Du saknar behörighet');
      } else {
        toast.show('Kunde inte skicka testnotis');
      }
    }
  };

  const onPromote = async () => {
    if (!promoteEmail.trim()) {
      toast.show('Ange en e-postadress');
      return;
    }
    if (!canPromote) {
      toast.show('Du saknar behörighet');
      return;
    }
    try {
      const res = await promoteUser({ email: promoteEmail.trim(), role: promoteRole });
      if (res.updated) {
        toast.show(`${res.user.email} uppgraderades till ${res.user.role}`);
      } else {
        toast.show(`${res.user.email} är redan ${res.user.role}`);
      }
      setPromoteEmail('');
    } catch (error: any) {
      if (error?.response?.status === 403) {
        toast.show('Du saknar behörighet');
      } else if (error?.response?.status === 404) {
        toast.show('Användaren hittades inte');
      } else {
        toast.show('Kunde inte uppdatera roll');
      }
    }
  };

  return (
    <ScrollView style={styles.c} contentContainerStyle={styles.content}>
      <Text style={styles.t}>Admin</Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Översikt</Text>
        <Text style={styles.hint}>Du är inloggad som {user?.email ?? 'okänd'} ({user?.role ?? 'unknown'}).</Text>
        <TouchableOpacity style={[styles.btn, styles.secondary]} onPress={onTestPush}>
          <Text style={styles.bt}>Skicka testnotis</Text>
        </TouchableOpacity>
      </View>

      {isStaff && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Uppgradera användare</Text>
          <Text style={styles.hint}>Tillåtna roller: {allowedRolesText}.</Text>
          <TextInput
            placeholder="namn@example.com"
            placeholderTextColor="#6b7280"
            value={promoteEmail}
            onChangeText={setPromoteEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            style={styles.input}
          />
          <View style={styles.roleRow}>
            {roleOptions.map((role) => (
              <TouchableOpacity
                key={role}
                testID={`role-${role}`}
                onPress={() => setPromoteRole(role)}
                style={[styles.roleChip, promoteRole === role && styles.roleChipActive]}
                accessibilityRole="button"
                accessibilityLabel={`Välj roll ${role}`}
              >
                <Text style={styles.roleChipText}>{role}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={styles.btn}
            onPress={onPromote}
            disabled={!promoteEmail.trim()}
          >
            <Text style={styles.bt}>Uppgradera</Text>
          </TouchableOpacity>
          {!canPromote && (
            <Text style={styles.warning}>Endast admins kan ändra roller. Försök ger ett felmeddelande.</Text>
          )}
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>CSV (email,classCode[,role])</Text>
        <TextInput
          multiline
          value={csv}
          onChangeText={(text) => {
            setCsv(text);
            setPreview([]);
            setValidated(false);
            setCsvError(null);
          }}
          style={styles.textarea}
        />
        <TouchableOpacity style={[styles.btn, styles.secondary]} onPress={onPreview}>
          <Text style={styles.bt}>Förhandsgranskning</Text>
        </TouchableOpacity>
        {preview.length > 0 && (
          <View style={styles.preview}>
            {preview.slice(0, 6).map((row, i) => (
              <Text key={i} style={styles.previewRow}>
                {row.join(' , ')}
              </Text>
            ))}
          </View>
        )}
        {csvError ? (
          <Text style={styles.error}>{csvError}</Text>
        ) : (
          <Text style={styles.hint}>Rollkolumnen är valfri. Tillåtna värden är {allowedRolesText}.</Text>
        )}
        <TouchableOpacity style={styles.btn} onPress={onUpload}>
          <Text style={styles.bt}>Skicka inbjudningar</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: '#0b1220' },
  content: { padding: 16, gap: 16 },
  t: { color: 'white', fontSize: 24, fontWeight: '800' },
  card: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1f2937'
  },
  sectionTitle: { color: 'white', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  hint: { color: '#9ca3af', marginTop: 8 },
  warning: { color: '#fca5a5', marginTop: 8 },
  input: {
    backgroundColor: '#0b1120',
    color: 'white',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1f2937',
    marginTop: 8
  },
  textarea: {
    minHeight: 140,
    backgroundColor: '#0b1120',
    color: 'white',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
    marginTop: 8
  },
  btn: {
    backgroundColor: '#3b82f6',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12
  },
  secondary: { backgroundColor: '#1f2937' },
  bt: { color: 'white', fontWeight: '700' },
  roleRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  roleChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#374151'
  },
  roleChipActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6'
  },
  roleChipText: { color: 'white', textTransform: 'capitalize', fontWeight: '600' },
  preview: { marginTop: 8 },
  previewRow: { color: '#9ca3af' },
  error: { color: '#f87171', marginTop: 8 }
});
