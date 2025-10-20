import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { createEvent } from '../../services/api';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/ToastProvider';

export default function EventEditor() {
  const { user } = useAuth();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('LÄXA');
  const [start, setStart] = useState(new Date(Date.now() + 36 * 3600 * 1000).toISOString());
  const [end, setEnd] = useState(new Date(Date.now() + 38 * 3600 * 1000).toISOString());
  const [saving, setSaving] = useState(false);
  const canManage = user?.role === 'teacher' || user?.role === 'admin';

  const onSave = async () => {
    if (!canManage) {
      toast.show('Du saknar behörighet');
      return;
    }
    setSaving(true);
    try {
      await createEvent({ classId: 'class-1', type, title, description, start, end });
      toast.show('Händelsen skapades');
      setTitle('');
      setDescription('');
    } catch (error: any) {
      if (error?.response?.status === 403) {
        toast.show('Du saknar behörighet');
      } else {
        toast.show('Kunde inte skapa händelsen');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.c}>
      <Text style={styles.t}>Skapa händelse</Text>
      <Text style={styles.l}>Titel</Text>
      <TextInput value={title} onChangeText={setTitle} style={styles.i} />
      <Text style={styles.l}>Beskrivning</Text>
      <TextInput value={description} onChangeText={setDescription} style={styles.i} />
      <Text style={styles.l}>Typ (LÄXA/IDROTT/UTFLYKT/PROV)</Text>
      <TextInput value={type} onChangeText={setType} style={styles.i} />
      <Text style={styles.l}>Start (ISO)</Text>
      <TextInput value={start} onChangeText={setStart} style={styles.i} />
      <Text style={styles.l}>Slut (ISO)</Text>
      <TextInput value={end} onChangeText={setEnd} style={styles.i} />
      {!canManage ? <Text style={styles.hint}>Endast lärare eller administratörer kan spara.</Text> : null}
      <TouchableOpacity
        style={[styles.btn, (!canManage || saving) && styles.btnDisabled]}
        onPress={onSave}
        accessibilityState={{ disabled: !canManage || saving }}
      >
        <Text style={styles.bt}>{saving ? 'Sparar…' : 'Spara'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, padding: 16, backgroundColor: '#0b1220' },
  t: { color: 'white', fontSize: 24, fontWeight: '800', marginBottom: 12 },
  l: { color: '#9ca3af', marginTop: 8 },
  i: {
    backgroundColor: '#111827',
    color: 'white',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151'
  },
  btn: {
    backgroundColor: '#22c55e',
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center'
  },
  btnDisabled: {
    opacity: 0.5
  },
  bt: { color: 'white', fontWeight: '700' },
  hint: { color: '#f97316', marginTop: 12 }
});