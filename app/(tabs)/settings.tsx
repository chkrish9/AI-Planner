import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Platform,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  PROVIDERS,
  getProviderKey,
  saveProviderKey,
  deleteProviderKey,
  getActiveProvider,
  setActiveProvider,
  getAllKeyStatuses,
  type ProviderId,
} from '../../src/ai/provider-config';
import { clearMessages } from '../../src/db/queries';
import { requestNotificationPermissions } from '../../src/notifications/scheduler';

export default function SettingsScreen() {
  const [keyStatuses, setKeyStatuses] = useState<Record<ProviderId, string | null>>({ anthropic: null, openai: null, google: null });
  const [activeProvider, setActiveProviderState] = useState<ProviderId>('anthropic');
  const [expandedProvider, setExpandedProvider] = useState<ProviderId | null>(null);
  const [inputKeys, setInputKeys] = useState<Record<ProviderId, string>>({ anthropic: '', openai: '', google: '' });

  useFocusEffect(
    useCallback(() => {
      async function load() {
        const [statuses, active] = await Promise.all([getAllKeyStatuses(), getActiveProvider()]);
        setKeyStatuses(statuses);
        setActiveProviderState(active);
      }
      load();
    }, [])
  );

  const handleSaveKey = async (id: ProviderId) => {
    const key = inputKeys[id].trim();
    if (!key) return;
    await saveProviderKey(id, key);
    setKeyStatuses((prev) => ({ ...prev, [id]: key }));
    setInputKeys((prev) => ({ ...prev, [id]: '' }));
    setExpandedProvider(null);
    // Auto-select as active if none was set
    if (!keyStatuses[activeProvider]) {
      await setActiveProvider(id);
      setActiveProviderState(id);
    }
  };

  const handleDeleteKey = (id: ProviderId) => {
    Alert.alert(`Remove ${PROVIDERS.find((p) => p.id === id)?.name} Key`, 'The key will be deleted from this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteProviderKey(id);
          setKeyStatuses((prev) => ({ ...prev, [id]: null }));
          if (activeProvider === id) {
            const fallback = PROVIDERS.find((p) => p.id !== id && keyStatuses[p.id]);
            const nextId = fallback?.id ?? 'anthropic';
            await setActiveProvider(nextId);
            setActiveProviderState(nextId);
          }
        },
      },
    ]);
  };

  const handleSetActive = async (id: ProviderId) => {
    if (!keyStatuses[id]) {
      Alert.alert('No Key', `Add a ${PROVIDERS.find((p) => p.id === id)?.name} API key first.`);
      return;
    }
    await setActiveProvider(id);
    setActiveProviderState(id);
  };

  const handleClearChat = () => {
    Alert.alert('Clear Chat History', 'Messages will be deleted. Tasks and events remain.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: async () => { await clearMessages(); } },
    ]);
  };

  const handleRequestNotifications = async () => {
    const granted = await requestNotificationPermissions();
    Alert.alert(
      granted ? 'Notifications Enabled' : 'Permission Denied',
      granted ? "You'll receive reminders as notifications." : 'Go to iOS Settings to enable notifications.'
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      {/* AI Providers */}
      <View style={styles.sectionWrap}>
        <View style={styles.sectionHeaderRow}>
          <View style={[styles.sectionIcon, { backgroundColor: '#eef2ff' }]}>
            <Ionicons name="key" size={18} color="#6366f1" />
          </View>
          <View>
            <Text style={styles.sectionTitle}>AI Providers</Text>
            <Text style={styles.sectionHint}>Add keys and select which AI to use</Text>
          </View>
        </View>

        {PROVIDERS.map((provider) => {
          const saved = keyStatuses[provider.id];
          const isActive = activeProvider === provider.id;
          const isExpanded = expandedProvider === provider.id;
          const inputVal = inputKeys[provider.id];

          return (
            <View key={provider.id} style={[styles.providerCard, isActive && styles.providerCardActive]}>
              {/* Provider row */}
              <View style={styles.providerRow}>
                <View style={[styles.providerIconBg, { backgroundColor: provider.bgColor }]}>
                  <Ionicons name={provider.iconName as React.ComponentProps<typeof Ionicons>['name']} size={20} color={provider.color} />
                </View>
                <View style={styles.providerInfo}>
                  <View style={styles.providerNameRow}>
                    <Text style={styles.providerName}>{provider.name}</Text>
                    {isActive && (
                      <View style={[styles.activeBadge, { backgroundColor: provider.bgColor }]}>
                        <Ionicons name="checkmark-circle" size={12} color={provider.color} />
                        <Text style={[styles.activeBadgeText, { color: provider.color }]}>Active</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.providerSubtitle}>{provider.subtitle}</Text>
                </View>

                <View style={styles.providerActions}>
                  {saved ? (
                    <>
                      <View style={styles.savedDot} />
                      <Text style={styles.savedLabel}>···{saved.slice(-4)}</Text>
                    </>
                  ) : (
                    <Text style={styles.noKeyLabel}>No key</Text>
                  )}
                </View>
              </View>

              {/* Controls */}
              <View style={styles.providerControls}>
                {!isActive && (
                  <TouchableOpacity
                    style={[styles.ctrlBtn, styles.ctrlBtnOutline, { borderColor: provider.color }]}
                    onPress={() => handleSetActive(provider.id)}
                  >
                    <Text style={[styles.ctrlBtnText, { color: provider.color }]}>Use This</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.ctrlBtn, { backgroundColor: provider.bgColor }]}
                  onPress={() => setExpandedProvider(isExpanded ? null : provider.id)}
                >
                  <Ionicons name={saved ? 'pencil-outline' : 'add'} size={14} color={provider.color} />
                  <Text style={[styles.ctrlBtnText, { color: provider.color }]}>{saved ? 'Change' : 'Add Key'}</Text>
                </TouchableOpacity>
                {saved && (
                  <TouchableOpacity
                    style={[styles.ctrlBtn, styles.ctrlBtnDanger]}
                    onPress={() => handleDeleteKey(provider.id)}
                  >
                    <Ionicons name="trash-outline" size={14} color="#ef4444" />
                  </TouchableOpacity>
                )}
              </View>

              {/* Key input (expanded) */}
              {isExpanded && (
                <View style={styles.keyInputWrap}>
                  <TextInput
                    style={styles.keyInput}
                    value={inputVal}
                    onChangeText={(v) => setInputKeys((prev) => ({ ...prev, [provider.id]: v }))}
                    placeholder={provider.keyPlaceholder}
                    placeholderTextColor="#9ca3af"
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus
                  />
                  <View style={styles.keyInputRow}>
                    <TouchableOpacity
                      style={[styles.ctrlBtn, { backgroundColor: provider.color, flex: 1 }, !inputVal.trim() && styles.btnDisabled]}
                      onPress={() => handleSaveKey(provider.id)}
                      disabled={!inputVal.trim()}
                    >
                      <Ionicons name="shield-checkmark-outline" size={14} color="#fff" />
                      <Text style={[styles.ctrlBtnText, { color: '#fff' }]}>Save Securely</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.ctrlBtn, styles.ctrlBtnGhost]}
                      onPress={() => setExpandedProvider(null)}
                    >
                      <Text style={[styles.ctrlBtnText, { color: '#6b7280' }]}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </View>

      {/* Notifications */}
      <View style={styles.sectionWrap}>
        <View style={styles.sectionHeaderRow}>
          <View style={[styles.sectionIcon, { backgroundColor: '#fef3c7' }]}>
            <Ionicons name="notifications" size={18} color="#d97706" />
          </View>
          <View>
            <Text style={styles.sectionTitle}>Notifications</Text>
            <Text style={styles.sectionHint}>Enable push reminders</Text>
          </View>
        </View>
        <TouchableOpacity style={[styles.btn, styles.btnOutline]} onPress={handleRequestNotifications}>
          <Ionicons name="notifications-outline" size={18} color="#6366f1" />
          <Text style={[styles.btnText, { color: '#6366f1' }]}>Enable Notifications</Text>
        </TouchableOpacity>
      </View>

      {/* Data */}
      <View style={styles.sectionWrap}>
        <View style={styles.sectionHeaderRow}>
          <View style={[styles.sectionIcon, { backgroundColor: '#fee2e2' }]}>
            <Ionicons name="server" size={18} color="#ef4444" />
          </View>
          <View>
            <Text style={styles.sectionTitle}>Data</Text>
            <Text style={styles.sectionHint}>Manage local data</Text>
          </View>
        </View>
        <TouchableOpacity style={[styles.btn, styles.btnDanger]} onPress={handleClearChat}>
          <Ionicons name="trash-outline" size={18} color="#ef4444" />
          <Text style={[styles.btnText, { color: '#ef4444' }]}>Clear Chat History</Text>
        </TouchableOpacity>
      </View>

      {/* About */}
      <View style={styles.sectionWrap}>
        <View style={styles.sectionHeaderRow}>
          <View style={[styles.sectionIcon, { backgroundColor: '#f3f4f6' }]}>
            <Ionicons name="information-circle" size={18} color="#6b7280" />
          </View>
          <View>
            <Text style={styles.sectionTitle}>About</Text>
          </View>
        </View>
        <View style={styles.aboutRow}>
          <Text style={styles.aboutLabel}>Version</Text>
          <Text style={styles.aboutValue}>1.0.0</Text>
        </View>
        <View style={styles.aboutRow}>
          <Text style={styles.aboutLabel}>Storage</Text>
          <Text style={styles.aboutValue}>Local device only</Text>
        </View>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f6fa' },
  content: { paddingBottom: 40 },
  header: {
    paddingTop: Platform.OS === 'ios' ? 56 : 20,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#111827' },

  sectionWrap: {
    backgroundColor: '#fff',
    marginTop: 16,
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    gap: 12,
  },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sectionIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  sectionHint: { fontSize: 12, color: '#9ca3af', marginTop: 1 },

  providerCard: {
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    padding: 14,
    gap: 10,
    backgroundColor: '#fafafa',
  },
  providerCardActive: {
    borderColor: '#6366f1',
    backgroundColor: '#fafbff',
  },
  providerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  providerIconBg: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  providerInfo: { flex: 1 },
  providerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  providerName: { fontSize: 16, fontWeight: '700', color: '#111827' },
  providerSubtitle: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  providerActions: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  savedDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#10b981' },
  savedLabel: { fontSize: 13, color: '#6b7280', fontWeight: '500' },
  noKeyLabel: { fontSize: 12, color: '#d1d5db' },

  activeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  activeBadgeText: { fontSize: 11, fontWeight: '700' },

  providerControls: { flexDirection: 'row', gap: 8 },
  ctrlBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    minHeight: 38,
  },
  ctrlBtnOutline: { borderWidth: 1.5, backgroundColor: 'transparent' },
  ctrlBtnDanger: { borderWidth: 1.5, borderColor: '#fca5a5', backgroundColor: '#fff1f2' },
  ctrlBtnGhost: { backgroundColor: 'transparent' },
  ctrlBtnText: { fontSize: 13, fontWeight: '600' },
  btnDisabled: { opacity: 0.4 },

  keyInputWrap: { gap: 10 },
  keyInput: {
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 14,
    color: '#111827',
  },
  keyInputRow: { flexDirection: 'row', gap: 8 },

  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    minHeight: 52,
  },
  btnOutline: { borderWidth: 1.5, borderColor: '#6366f1', backgroundColor: 'transparent' },
  btnDanger: { borderWidth: 1.5, borderColor: '#ef4444', backgroundColor: 'transparent' },
  btnText: { fontSize: 15, fontWeight: '600' },

  aboutRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f3f4f6' },
  aboutLabel: { fontSize: 14, color: '#6b7280' },
  aboutValue: { fontSize: 14, color: '#111827', fontWeight: '500' },
});
