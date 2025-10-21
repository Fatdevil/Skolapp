import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import {
  type AuditLogItem,
  type MetricsSummary,
  getAuditLogs,
  getCronHealth,
  getHealth,
  getMetricsSummary,
  getSystemHealth,
  promoteUser,
  sendTestPush,
  uploadInvites,
  type AuditQuery,
  type CronHealth
} from '../../services/api';
import { api } from '../../services/api';
import { useToast } from '../../components/ToastProvider';
import { useAuth } from '../../auth/AuthContext';

const INVITE_PLACEHOLDER = 'email,classCode,role\nanna@example.com,3A,guardian\n';
const PAGE_SIZE = 20;

type TabKey = 'invites' | 'observability' | 'audit';

type ObservabilityState = {
  summary: MetricsSummary | null;
  health: Record<string, any> | null;
  system: Record<string, any> | null;
  cron: CronHealth | null;
};

const defaultObservability: ObservabilityState = {
  summary: null,
  health: null,
  system: null,
  cron: null
};

const inviteRoles: Array<'guardian' | 'teacher' | 'admin'> = ['guardian', 'teacher', 'admin'];

export default function AdminScreen() {
  const toast = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const showPromote = user?.role === 'teacher' || isAdmin;

  const [activeTab, setActiveTab] = useState<TabKey>('invites');
  const [csv, setCsv] = useState(INVITE_PLACEHOLDER);
  const [preview, setPreview] = useState<string[][]>([]);
  const [validated, setValidated] = useState(false);
  const [promoteEmail, setPromoteEmail] = useState('');
  const [promoteRole, setPromoteRole] = useState<'guardian' | 'teacher' | 'admin'>('teacher');

  const [observability, setObservability] = useState<ObservabilityState>(defaultObservability);
  const [observabilityLoading, setObservabilityLoading] = useState(false);

  const [auditFilters, setAuditFilters] = useState<AuditQuery>({ limit: PAGE_SIZE, page: 1 });
  const [auditDraft, setAuditDraft] = useState<{ action: string; email: string; from: string; to: string }>({
    action: '',
    email: '',
    from: '',
    to: ''
  });
  const [auditItems, setAuditItems] = useState<AuditLogItem[]>([]);
  const [auditAvailableActions, setAuditAvailableActions] = useState<string[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditLoading, setAuditLoading] = useState(false);

  const tabs = useMemo(() => {
    if (!isAdmin) {
      return [{ key: 'invites' as TabKey, label: 'Inbjudningar' }];
    }
    return [
      { key: 'invites' as TabKey, label: 'Inbjudningar' },
      { key: 'observability' as TabKey, label: 'Observability' },
      { key: 'audit' as TabKey, label: 'Audit' }
    ];
  }, [isAdmin]);

  const metricsUrl = `${api.defaults.baseURL?.replace(/\/$/, '') ?? ''}/metrics`;

  const onPreview = useCallback(() => {
    try {
      const lines = csv.trim().split(/\r?\n/);
      const rows = lines.map((line) => line.split(',').map((value) => value.trim()));
      const header = rows[0]?.map((value) => value.toLowerCase()) ?? [];
      const hasEmail = header.includes('email');
      const hasClass = header.includes('classcode');
      setPreview(rows);
      setValidated(rows.length > 1 && hasEmail && hasClass);
    } catch {
      setPreview([['Fel vid parsning']]);
      setValidated(false);
    }
  }, [csv]);

  const onUpload = useCallback(async () => {
    if (!validated) {
      toast.show('CSV saknar korrekta kolumnnamn (email,classCode[,role])');
      return;
    }
    const lines = csv.trim().split(/\r?\n/);
    const header = lines[0]?.split(',').map((value) => value.trim().toLowerCase()) ?? [];
    const roleIdx = header.indexOf('role');
    if (roleIdx >= 0) {
      const invalidRoles = lines
        .slice(1)
        .map((line) => line.split(',').map((value) => value.trim())[roleIdx])
        .filter((value) => value && !inviteRoles.includes(value.toLowerCase() as any));
      if (invalidRoles.length > 0) {
        toast.show('Ogiltig roll i CSV (tillåtna: guardian, teacher, admin)');
        return;
      }
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
  }, [csv, toast, validated]);

  const onTestPush = useCallback(async () => {
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
  }, [toast]);

  const onPromote = useCallback(async () => {
    if (!promoteEmail.trim()) {
      toast.show('Ange e-postadress');
      return;
    }
    try {
      const res = await promoteUser({ email: promoteEmail.trim(), role: promoteRole });
      toast.show(`${res.user.email} har nu rollen ${res.user.role}`);
    } catch (error: any) {
      if (error?.response?.status === 403) {
        toast.show('Du saknar behörighet');
      } else {
        toast.show('Kunde inte uppdatera roll just nu');
      }
    }
  }, [promoteEmail, promoteRole, toast]);

  const loadObservability = useCallback(async () => {
    if (!isAdmin) return;
    setObservabilityLoading(true);
    try {
      const [health, system, cron, summary] = await Promise.all([
        getHealth(),
        getSystemHealth(),
        getCronHealth(),
        getMetricsSummary()
      ]);
      setObservability({
        health: health ?? null,
        system: system ?? null,
        cron: cron ?? null,
        summary: summary ?? null
      });
    } catch (error) {
      console.error('Observability load failed', error);
      toast.show('Kunde inte hämta observability-data just nu');
    } finally {
      setObservabilityLoading(false);
    }
  }, [isAdmin, toast]);

  const loadAudit = useCallback(async () => {
    if (!isAdmin) return;
    setAuditLoading(true);
    try {
      const response = await getAuditLogs({
        limit: auditFilters.limit ?? PAGE_SIZE,
        page: auditFilters.page ?? 1,
        action: auditFilters.action || undefined,
        email: auditFilters.email || undefined,
        from: auditFilters.from || undefined,
        to: auditFilters.to || undefined
      });
      setAuditItems(response.items);
      setAuditTotal(response.total);
      const actions = Array.from(new Set(response.items.map((item) => item.action))).sort();
      setAuditAvailableActions(actions);
    } catch (error) {
      console.error('Audit load failed', error);
      toast.show('Kunde inte hämta audit-loggar just nu');
    } finally {
      setAuditLoading(false);
    }
  }, [auditFilters, isAdmin, toast]);

  useEffect(() => {
    if (activeTab === 'observability') {
      loadObservability();
    }
  }, [activeTab, loadObservability]);

  useEffect(() => {
    if (activeTab === 'audit') {
      loadAudit();
    }
  }, [activeTab, loadAudit]);

  useEffect(() => {
    setAuditDraft((prev) => ({
      ...prev,
      action: auditFilters.action ?? '',
      email: auditFilters.email ?? '',
      from: auditFilters.from ?? '',
      to: auditFilters.to ?? ''
    }));
  }, [auditFilters.action, auditFilters.email, auditFilters.from, auditFilters.to]);

  const totalPages = Math.max(1, Math.ceil(auditTotal / (auditFilters.limit ?? PAGE_SIZE)));

  const onCopyMetrics = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(metricsUrl);
      toast.show('Kopierade /metrics URL till urklipp');
    } catch (error) {
      console.error('Clipboard copy failed', error);
      toast.show('Kunde inte kopiera URL just nu');
    }
  }, [metricsUrl, toast]);

  const renderInviteTab = () => (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Admin</Text>
      <Text style={styles.roleText}>
        Din roll: <Text style={styles.roleValue}>{user?.role ?? 'okänd'}</Text>
      </Text>
      <Text style={styles.label}>CSV (email,classCode,role)</Text>
      <TextInput
        multiline
        value={csv}
        onChangeText={(text) => {
          setCsv(text);
          setPreview([]);
          setValidated(false);
        }}
        style={styles.textarea}
      />
      <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={onPreview}>
        <Text style={styles.buttonText}>Förhandsgranskning</Text>
      </TouchableOpacity>
      {preview.length > 0 && (
        <View style={styles.previewContainer}>
          {preview.slice(0, 6).map((row, index) => (
            <Text key={index} style={styles.previewRow}>
              {row.join(' , ')}
            </Text>
          ))}
          {!validated && (
            <Text style={styles.errorText}>Rubrik måste vara: email,classCode[,role]</Text>
          )}
        </View>
      )}
      <TouchableOpacity style={styles.button} onPress={onUpload}>
        <Text style={styles.buttonText}>Skicka inbjudningar</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={onTestPush}>
        <Text style={styles.buttonText}>Skicka testnotis</Text>
      </TouchableOpacity>
      <Text style={styles.hint}>Tillåtna roller: guardian, teacher, admin. Oifylld kolumn ger guardian.</Text>
      {showPromote && (
        <View style={styles.promoteSection}>
          <Text style={styles.subTitle}>Promote användare</Text>
          {!isAdmin && <Text style={styles.hint}>Endast administratörer kan genomföra uppgraderingen.</Text>}
          <Text style={styles.label}>E-postadress</Text>
          <TextInput
            value={promoteEmail}
            onChangeText={setPromoteEmail}
            placeholder="user@example.com"
            placeholderTextColor="#6b7280"
            style={styles.textarea}
            autoCapitalize="none"
          />
          <Text style={styles.label}>Ny roll</Text>
          <View style={styles.rolePicker}>
            {inviteRoles.map((role) => (
              <TouchableOpacity
                key={role}
                style={[styles.chip, promoteRole === role && styles.chipActive]}
                onPress={() => setPromoteRole(role)}
              >
                <Text style={[styles.chipText, promoteRole === role && styles.chipTextActive]}>{role}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.button} onPress={onPromote}>
            <Text style={styles.buttonText}>Uppdatera roll</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );

  const formatTimestamp = (value: string | null | undefined) => {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleString();
    } catch {
      return value;
    }
  };

  const formatNumber = (value: number | null | undefined, fraction = 0) => {
    if (value === null || value === undefined) return '—';
    return value.toFixed(fraction);
  };

  const renderObservabilityCard = (title: string, rows: Array<{ label: string; value: string }>) => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {rows.map((row) => (
        <View key={row.label} style={styles.cardRow}>
          <Text style={styles.cardRowLabel}>{row.label}</Text>
          <Text style={styles.cardRowValue}>{row.value}</Text>
        </View>
      ))}
    </View>
  );

  const renderObservabilityTab = () => (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={observabilityLoading} onRefresh={loadObservability} tintColor="#94a3b8" />
      }
    >
      <View style={styles.observabilityHeader}>
        <Text style={styles.heading}>Observability</Text>
        <TouchableOpacity style={[styles.button, styles.smallButton]} onPress={onCopyMetrics}>
          <Text style={styles.buttonTextSmall}>Kopiera /metrics URL</Text>
        </TouchableOpacity>
      </View>
      {observabilityLoading && !observability.summary && (
        <ActivityIndicator color="#3b82f6" style={{ marginBottom: 16 }} />
      )}
      {observability.summary && (
        <View style={styles.cardGrid}>
          {renderObservabilityCard('API Health', [
            { label: 'Status', value: String(observability.health?.status ?? 'ok') },
            { label: 'Event loop delay', value: formatNumber(observability.system?.eventLoopDelay) + ' ms' },
            { label: 'Heap used', value: observability.system?.heapUsed ? `${Math.round(observability.system.heapUsed / 1024 / 1024)} MB` : '—' }
          ])}
          {renderObservabilityCard('Traffic snapshot', [
            { label: 'Requests/min', value: formatNumber(observability.summary.requestsPerMinute) },
            { label: '5xx/min', value: formatNumber(observability.summary.errorsPerMinute) },
            { label: 'Rate-limit/min', value: formatNumber(observability.summary.rateLimitPerMinute) },
            { label: 'p50', value: `${formatNumber(observability.summary.latencyMs.p50, 2)} ms` },
            { label: 'p95', value: `${formatNumber(observability.summary.latencyMs.p95, 2)} ms` }
          ])}
          {renderObservabilityCard('RBAC & 429', [
            { label: 'RBAC total', value: formatNumber(observability.summary.counters.rbacForbidden) },
            { label: 'Rate-limit total', value: formatNumber(observability.summary.counters.rateLimitHit) },
            { label: 'Cron utskick', value: formatNumber(observability.summary.counters.cronRemindersSent) }
          ])}
          {renderObservabilityCard('Cron health', [
            { label: 'Senaste körning', value: formatTimestamp(observability.cron?.lastRunAt) },
            { label: 'Senaste lyckade', value: formatTimestamp(observability.cron?.lastSuccessAt) },
            { label: 'Senaste fel', value: observability.cron?.lastError ?? '—' },
            { label: 'Utskick 24h', value: formatNumber(observability.cron?.sent24h) }
          ])}
        </View>
      )}
    </ScrollView>
  );

  const applyAuditFilters = () => {
    setAuditFilters({
      limit: PAGE_SIZE,
      page: 1,
      action: auditDraft.action || undefined,
      email: auditDraft.email.trim() || undefined,
      from: auditDraft.from.trim() || undefined,
      to: auditDraft.to.trim() || undefined
    });
  };

  const AuditRow: React.FC<{ item: AuditLogItem }> = ({ item }) => {
    const [expanded, setExpanded] = useState(false);
    const meta = item.meta ? JSON.stringify(item.meta, null, 2) : '—';
    const displayMeta = expanded ? meta : meta.slice(0, 80) + (meta.length > 80 ? '…' : '');
    return (
      <View style={styles.auditRow}>
        <Text style={styles.auditTimestamp}>{formatTimestamp(item.created_at)}</Text>
        <Text style={styles.auditAction}>{item.action}</Text>
        <Text style={styles.auditActor}>Aktör: {item.actor_user_id ?? '—'}</Text>
        <Text style={styles.auditTarget}>Mål: {item.target_user_id ?? '—'}</Text>
        <TouchableOpacity onPress={() => setExpanded((prev) => !prev)}>
          <Text style={styles.auditMeta}>{displayMeta}</Text>
          {meta.length > 80 && (
            <Text style={styles.auditToggle}>{expanded ? 'Visa mindre' : 'Visa mer'}</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  const renderAuditTab = () => (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Audit-loggar</Text>
      <Text style={styles.hint}>Filtrera på åtgärd, e-post eller datumintervall (ISO-format YYYY-MM-DD).</Text>
      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>Åtgärd</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
          <TouchableOpacity
            key="all"
            style={[styles.filterChip, !auditDraft.action && styles.filterChipActive]}
            onPress={() => {
              setAuditDraft((prev) => ({ ...prev, action: '' }));
              setAuditFilters((prev) => ({ ...prev, action: undefined, page: 1 }));
            }}
          >
            <Text style={[styles.filterChipText, !auditDraft.action && styles.filterChipTextActive]}>Alla</Text>
          </TouchableOpacity>
          {auditAvailableActions.map((action) => (
            <TouchableOpacity
              key={action}
              style={[styles.filterChip, auditDraft.action === action && styles.filterChipActive]}
              onPress={() => {
                setAuditDraft((prev) => ({ ...prev, action }));
                setAuditFilters((prev) => ({ ...prev, action, page: 1 }));
              }}
            >
              <Text style={[styles.filterChipText, auditDraft.action === action && styles.filterChipTextActive]}>
                {action}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <Text style={styles.filterLabel}>E-post eller user-id</Text>
        <TextInput
          value={auditDraft.email}
          onChangeText={(text) => setAuditDraft((prev) => ({ ...prev, email: text }))}
          placeholder="user@example.com eller user-id"
          placeholderTextColor="#6b7280"
          style={styles.textarea}
          autoCapitalize="none"
        />
        <View style={styles.dateRow}>
          <View style={styles.dateField}>
            <Text style={styles.filterLabel}>Från (YYYY-MM-DD)</Text>
            <TextInput
              value={auditDraft.from}
              onChangeText={(text) => setAuditDraft((prev) => ({ ...prev, from: text }))}
              placeholder="2025-01-01"
              placeholderTextColor="#6b7280"
              style={styles.textarea}
              autoCapitalize="none"
            />
          </View>
          <View style={styles.dateField}>
            <Text style={styles.filterLabel}>Till (YYYY-MM-DD)</Text>
            <TextInput
              value={auditDraft.to}
              onChangeText={(text) => setAuditDraft((prev) => ({ ...prev, to: text }))}
              placeholder="2025-01-31"
              placeholderTextColor="#6b7280"
              style={styles.textarea}
              autoCapitalize="none"
            />
          </View>
        </View>
        <TouchableOpacity style={[styles.button, styles.smallButton]} onPress={applyAuditFilters}>
          <Text style={styles.buttonTextSmall}>Filtrera</Text>
        </TouchableOpacity>
      </View>
      {auditLoading && <ActivityIndicator color="#3b82f6" style={{ marginVertical: 12 }} />}
      {!auditLoading && auditItems.length === 0 && (
        <Text style={styles.hint}>Inga loggar hittades med aktuella filter.</Text>
      )}
      <View>
        {auditItems.map((item) => (
          <AuditRow key={`${item.created_at}-${item.action}-${item.actor_user_id ?? 'na'}`} item={item} />
        ))}
      </View>
      <View style={styles.paginationRow}>
        <TouchableOpacity
          style={[styles.button, styles.smallButton, auditFilters.page === 1 && styles.disabledButton]}
          disabled={auditFilters.page === 1}
          onPress={() => setAuditFilters((prev) => ({ ...prev, page: Math.max(1, (prev.page ?? 1) - 1) }))}
        >
          <Text style={styles.buttonTextSmall}>Föregående</Text>
        </TouchableOpacity>
        <Text style={styles.paginationLabel}>
          Sida {auditFilters.page ?? 1} av {totalPages}
        </Text>
        <TouchableOpacity
          style={[
            styles.button,
            styles.smallButton,
            auditFilters.page === totalPages && styles.disabledButton
          ]}
          disabled={auditFilters.page === totalPages}
          onPress={() => setAuditFilters((prev) => ({ ...prev, page: Math.min(totalPages, (prev.page ?? 1) + 1) }))}
        >
          <Text style={styles.buttonTextSmall}>Nästa</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  const renderTabContent = () => {
    if (activeTab === 'observability' && isAdmin) return renderObservabilityTab();
    if (activeTab === 'audit' && isAdmin) return renderAuditTab();
    return renderInviteTab();
  };

  return (
    <View style={styles.container}>
      <View style={styles.tabRow}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tabButton, activeTab === tab.key && styles.tabButtonActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabButtonText, activeTab === tab.key && styles.tabButtonTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {renderTabContent()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b1220'
  },
  scroll: {
    flex: 1
  },
  content: {
    padding: 16,
    paddingBottom: 48
  },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: '#0b1220'
  },
  tabButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#1f2937',
    marginRight: 8,
    backgroundColor: '#111827'
  },
  tabButtonActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb'
  },
  tabButtonText: {
    color: '#9ca3af',
    fontWeight: '600'
  },
  tabButtonTextActive: {
    color: 'white'
  },
  heading: {
    color: 'white',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 12
  },
  roleText: {
    color: '#9ca3af',
    marginBottom: 12
  },
  roleValue: {
    color: '#fbbf24',
    fontWeight: '700'
  },
  label: {
    color: '#9ca3af',
    marginBottom: 6
  },
  textarea: {
    minHeight: 60,
    backgroundColor: '#111827',
    color: 'white',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
    marginBottom: 12
  },
  button: {
    backgroundColor: '#3b82f6',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8
  },
  smallButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignSelf: 'flex-start'
  },
  buttonText: {
    color: 'white',
    fontWeight: '700'
  },
  buttonTextSmall: {
    color: 'white',
    fontWeight: '700',
    fontSize: 13
  },
  secondaryButton: {
    backgroundColor: '#1f2937'
  },
  buttonTextSecondary: {
    color: '#e5e7eb'
  },
  previewContainer: {
    marginTop: 8
  },
  previewRow: {
    color: '#9ca3af'
  },
  errorText: {
    color: '#ef4444',
    marginTop: 4
  },
  hint: {
    color: '#9ca3af',
    marginTop: 12
  },
  promoteSection: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#1f2937'
  },
  subTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12
  },
  rolePicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#111827',
    marginRight: 8,
    marginBottom: 8
  },
  chipActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6'
  },
  chipText: {
    color: '#9ca3af',
    fontWeight: '600',
    textTransform: 'capitalize'
  },
  chipTextActive: {
    color: 'white'
  },
  observabilityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  cardGrid: {
    gap: 12
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
    padding: 16
  },
  cardTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4
  },
  cardRowLabel: {
    color: '#9ca3af'
  },
  cardRowValue: {
    color: '#e5e7eb',
    fontWeight: '600'
  },
  cardRowLast: {
    marginBottom: 0
  },
  filterSection: {
    backgroundColor: '#111827',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
    padding: 16,
    marginBottom: 16
  },
  filterLabel: {
    color: '#9ca3af',
    marginBottom: 6
  },
  chipScroll: {
    marginBottom: 12
  },
  filterChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#111827',
    marginRight: 8
  },
  filterChipActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb'
  },
  filterChipText: {
    color: '#9ca3af',
    fontWeight: '600'
  },
  filterChipTextActive: {
    color: 'white'
  },
  dateRow: {
    flexDirection: 'row',
    gap: 12
  },
  dateField: {
    flex: 1
  },
  auditRow: {
    backgroundColor: '#111827',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
    padding: 16,
    marginBottom: 12
  },
  auditTimestamp: {
    color: '#e5e7eb',
    fontWeight: '700',
    marginBottom: 4
  },
  auditAction: {
    color: '#60a5fa',
    marginBottom: 4,
    fontWeight: '600'
  },
  auditActor: {
    color: '#cbd5f5',
    marginBottom: 2
  },
  auditTarget: {
    color: '#cbd5f5',
    marginBottom: 8
  },
  auditMeta: {
    color: '#9ca3af',
    fontFamily: 'monospace'
  },
  auditToggle: {
    color: '#3b82f6',
    marginTop: 4
  },
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16
  },
  paginationLabel: {
    color: '#9ca3af',
    fontWeight: '600'
  },
  disabledButton: {
    backgroundColor: '#1f2937',
    borderColor: '#1f2937'
  }
});
