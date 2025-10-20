import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl, TouchableOpacity } from 'react-native';
import { getEvents, deleteEvent } from '../../services/api';
import EventCard from '../../components/EventCard';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/ToastProvider';

export default function CalendarScreen() {
  const { user } = useAuth();
  const toast = useToast();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const canManage = user?.role === 'teacher' || user?.role === 'admin';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEvents(await getEvents('class-1'));
    } catch {
      toast.show('Kunde inte hämta händelser');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (id: string) => {
    if (!canManage) {
      toast.show('Du saknar behörighet');
      return;
    }
    try {
      await deleteEvent(id);
      await load();
      toast.show('Händelsen togs bort');
    } catch (error: any) {
      if (error?.response?.status === 403) {
        toast.show('Du saknar behörighet');
      } else {
        toast.show('Kunde inte ta bort händelsen');
      }
    }
  };

  return (
    <View style={styles.c}>
      <Text style={styles.t}>Kalender</Text>
      <FlatList
        data={events}
        keyExtractor={(i) => i.id || Math.random().toString()}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        renderItem={({ item }) => (
          <View>
            <EventCard event={item} />
            <TouchableOpacity
              onPress={() => handleDelete(item.id)}
              style={[styles.delete, !canManage && styles.deleteDisabled]}
              accessibilityState={{ disabled: !canManage }}
            >
              <Text style={{ color: 'white' }}>Radera</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.e}>Inga händelser ännu</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, padding: 16, backgroundColor: '#0b1220' },
  t: { color: 'white', fontSize: 24, fontWeight: '800', marginBottom: 12 },
  e: { color: '#9ca3af', marginTop: 24, textAlign: 'center' },
  delete: {
    backgroundColor: '#ef4444',
    padding: 8,
    borderRadius: 8,
    marginTop: 6,
    alignSelf: 'flex-start'
  },
  deleteDisabled: {
    opacity: 0.5
  }
});