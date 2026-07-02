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
import { getApiKey, saveApiKey, deleteApiKey } from '../../src/ai/client';
import { clearMessages } from '../../src/db/queries';
import { requestNotificationPermissions } from '../../src/notifications/scheduler';

export default function SettingsScreen() {
  const [apiKey, setApiKey] = useState('');
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getApiKey().then((k) => setSavedKey(k));
    }, [])
  );

  const handleSaveKey = async () => {
    const trimmed = apiKey.trim();
    if (!trimmed.startsWith('sk-ant-')) {
      Alert.alert('Invalid Key', 'Anthropic API keys start with "sk-ant-".');
      return;
    }
    await saveApiKey(trimmed);
    setSavedKey(trimmed);
    setApiKey('');
    setEditing(false);
  };

  const handleDeleteKey = () => {
    Alert.alert('Remove API Key', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => { await deleteApiKey(); setSavedKey(null); } },
    ]);
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
      granted ? 'You\'ll receive reminders as notifications.' : 'Go to iOS Settings to enable notifications.'
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      {/* API Key */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionIcon, { backgroundColor: '#eef2ff' }]}>
            <Ionicons name="key" size={18} color="#6366f1" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>Anthropic API Key</Text>
            <Text style={styles.sectionHint}>Required for the AI assistant</Text>
          </View>
        </View>

        {savedKey && !editing ? (
          <>
            <View style={styles.savedBadge}>
              <Ionicons name="checkmark-circle" size={16} color="#059669" />
              <Text style={styles.savedBadgeText}>Key saved  ···{savedKey.slice(-4)}</Text>
            </View>
            <View style={styles.btnRow}>
              <TouchableOpacity style={[styles.btn, styles.btnOutline, { flex: 1 }]} onPress={() => setEditing(true)}>
                <Ionicons name="pencil-outline" size={16} color="#6366f1" />
                <Text style={[styles.btnText, { color: '#6366f1' }]}>Change Key</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnDanger, { flex: 1 }]} onPress={handleDeleteKey}>
                <Ionicons name="trash-outline" size={16} color="#ef4444" />
                <Text style={[styles.btnText, { color: '#ef4444' }]}>Remove</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <TextInput
              style={styles.input}
              value={apiKey}
              onChangeText={setApiKey}
              placeholder="sk-ant-api03-..."
              placeholderTextColor="#9ca3af"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.btnRow}>
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary, { flex: 1 }, !apiKey.trim() && styles.btnDisabled]}
                onPress={handleSaveKey}
                disabled={!apiKey.trim()}
              >
                <Ionicons name="shield-checkmark-outline" size={16} color="#fff" />
                <Text style={[styles.btnText, { color: '#fff' }]}>Save Key Securely</Text>
              </TouchableOpacity>
              {editing && (
                <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => setEditing(false)}>
                  <Text style={[styles.btnText, { color: '#6b7280' }]}>Cancel</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}
      </View>

      {/* Notifications */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionIcon, { backgroundColor: '#fef3c7' }]}>
            <Ionicons name="notifications" size={18} color="#d97706" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>Notifications</Text>
            <Text style={styles.sectionHint}>Enable push reminders</Text>
          </View>
        </View>
        <TouchableOpacity style={[styles.btn, styles.btnOutline, styles.btnFull]} onPress={handleRequestNotifications}>
          <Ionicons name="notifications-outline" size={18} color="#6366f1" />
          <Text style={[styles.btnText, { color: '#6366f1' }]}>Enable Notifications</Text>
        </TouchableOpacity>
      </View>

      {/* Data */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionIcon, { backgroundColor: '#fee2e2' }]}>
            <Ionicons name="server" size={18} color="#ef4444" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>Data</Text>
            <Text style={styles.sectionHint}>Manage local data</Text>
          </View>
        </View>
        <TouchableOpacity style={[styles.btn, styles.btnDanger, styles.btnFull]} onPress={handleClearChat}>
          <Ionicons name="trash-outline" size={18} color="#ef4444" />
          <Text style={[styles.btnText, { color: '#ef4444' }]}>Clear Chat History</Text>
        </TouchableOpacity>
      </View>

      {/* About */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionIcon, { backgroundColor: '#f3f4f6' }]}>
            <Ionicons name="information-circle" size={18} color="#6b7280" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>About</Text>
          </View>
        </View>
        <View style={styles.aboutRow}>
          <Text style={styles.aboutLabel}>Version</Text>
          <Text style={styles.aboutValue}>1.0.0</Text>
        </View>
        <View style={styles.aboutRow}>
          <Text style={styles.aboutLabel}>AI Model</Text>
          <Text style={styles.aboutValue}>Claude claude-sonnet-4-6</Text>
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
  section: {
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
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sectionIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  sectionHint: { fontSize: 12, color: '#9ca3af', marginTop: 1 },
  input: {
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#111827',
  },
  savedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#d1fae5',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 10,
  },
  savedBadgeText: { color: '#065f46', fontWeight: '600', fontSize: 14 },
  btnRow: { flexDirection: 'row', gap: 10 },
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
  btnFull: { width: '100%' },
  btnPrimary: { backgroundColor: '#6366f1' },
  btnOutline: { borderWidth: 1.5, borderColor: '#6366f1', backgroundColor: 'transparent' },
  btnDanger: { borderWidth: 1.5, borderColor: '#ef4444', backgroundColor: 'transparent' },
  btnGhost: { backgroundColor: 'transparent' },
  btnDisabled: { opacity: 0.4 },
  btnText: { fontSize: 15, fontWeight: '600' },
  aboutRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f3f4f6' },
  aboutLabel: { fontSize: 14, color: '#6b7280' },
  aboutValue: { fontSize: 14, color: '#111827', fontWeight: '500' },
});
