import { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { sendMessage, getApiKey, type StreamChunk } from '../../src/ai/client';
import { getRecentMessages, type Message } from '../../src/db/queries';

interface DisplayMessage extends Message {
  pending?: boolean;
  toolActivity?: string;
}

const WELCOME: DisplayMessage = {
  id: -1,
  role: 'assistant',
  content: 'Hi! I\'m your AI planner. Try:\n\n• "Remind me to take vitamins every day at 8am"\n• "What\'s my plan for today?"\n• "Add team meeting every Tuesday at 10am"\n• "I have a dentist appointment this Friday at 3pm"',
  created_at: new Date().toISOString(),
};

export default function ChatScreen() {
  const [messages, setMessages] = useState<DisplayMessage[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const listRef = useRef<FlatList>(null);

  useFocusEffect(
    useCallback(() => {
      async function init() {
        const key = await getApiKey();
        setHasApiKey(!!key);
        if (key) {
          const history = await getRecentMessages(50);
          if (history.length > 0) setMessages([WELCOME, ...history]);
        }
      }
      init();
    }, [])
  );

  const scrollToBottom = () => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    if (!hasApiKey) {
      Alert.alert('API Key Required', 'Add your Anthropic API key in Settings first.', [{ text: 'OK' }]);
      return;
    }

    setInput('');
    const userMsg: DisplayMessage = { id: Date.now(), role: 'user', content: text, created_at: new Date().toISOString() };
    const pendingMsg: DisplayMessage = { id: Date.now() + 1, role: 'assistant', content: '', created_at: new Date().toISOString(), pending: true };

    setMessages((prev) => [...prev, userMsg, pendingMsg]);
    setLoading(true);
    scrollToBottom();

    let accumulated = '';

    await sendMessage(text, (chunk: StreamChunk) => {
      switch (chunk.type) {
        case 'text':
          accumulated += chunk.text ?? '';
          setMessages((prev) => prev.map((m) => m.pending ? { ...m, content: accumulated, toolActivity: undefined } : m));
          break;
        case 'tool_start':
          setMessages((prev) => prev.map((m) => m.pending ? { ...m, toolActivity: formatToolName(chunk.toolName ?? '') } : m));
          break;
        case 'tool_done':
          setMessages((prev) => prev.map((m) => m.pending ? { ...m, toolActivity: undefined } : m));
          break;
        case 'done':
          setMessages((prev) => prev.map((m) => m.pending ? { ...m, pending: false } : m));
          setLoading(false);
          scrollToBottom();
          break;
        case 'error':
          setMessages((prev) => prev.map((m) => m.pending ? { ...m, content: `⚠️ ${chunk.error}`, pending: false } : m));
          setLoading(false);
          break;
      }
    });
  };

  const renderMessage = ({ item }: { item: DisplayMessage }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.msgRow, isUser && styles.msgRowUser]}>
        {!isUser && (
          <View style={styles.avatar}>
            <Ionicons name="sparkles" size={14} color="#fff" />
          </View>
        )}
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAI]}>
          {item.toolActivity ? (
            <View style={styles.toolActivity}>
              <ActivityIndicator size="small" color="#6366f1" />
              <Text style={styles.toolActivityText}>{item.toolActivity}</Text>
            </View>
          ) : null}
          {item.pending && !item.content && !item.toolActivity ? (
            <View style={styles.typingDots}>
              <ActivityIndicator size="small" color="#6366f1" />
            </View>
          ) : (
            <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>
              {item.content}
            </Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerIconWrap}>
          <Ionicons name="sparkles" size={20} color="#6366f1" />
        </View>
        <View>
          <Text style={styles.headerTitle}>AI Planner</Text>
          <Text style={styles.headerSub}>Your personal assistant</Text>
        </View>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderMessage}
        contentContainerStyle={styles.list}
        onContentSizeChange={scrollToBottom}
      />

      {/* Input bar */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Ask me anything…"
          placeholderTextColor="#9ca3af"
          multiline
          maxLength={500}
          returnKeyType="send"
          onSubmitEditing={handleSend}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (loading || !input.trim()) && styles.sendBtnOff]}
          onPress={handleSend}
          disabled={loading || !input.trim()}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-up" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function formatToolName(name: string): string {
  const map: Record<string, string> = {
    add_task: 'Adding task…',
    add_event: 'Adding event…',
    add_reminder: 'Setting reminder…',
    list_tasks: 'Fetching tasks…',
    list_events: 'Fetching events…',
    plan_day: 'Planning your day…',
    complete_task: 'Completing task…',
    delete_item: 'Deleting item…',
  };
  return map[name] ?? `Running ${name}…`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f6fa' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: Platform.OS === 'ios' ? 56 : 20,
    paddingBottom: 14,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  headerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  headerSub: { fontSize: 12, color: '#6b7280', marginTop: 1 },
  list: { paddingVertical: 16, paddingHorizontal: 14, gap: 10 },
  msgRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',   // avatar aligned to top of bubble
    gap: 8,
  },
  msgRowUser: { justifyContent: 'flex-end' },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 2,
  },
  bubble: {
    maxWidth: '78%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  bubbleAI: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 4,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  bubbleUser: {
    backgroundColor: '#6366f1',
    borderTopRightRadius: 4,
  },
  bubbleText: { fontSize: 15, color: '#111827', lineHeight: 22 },
  bubbleTextUser: { color: '#fff' },
  toolActivity: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  toolActivityText: { fontSize: 12, color: '#6366f1', fontStyle: 'italic' },
  typingDots: { paddingVertical: 4 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
  },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 110,
    backgroundColor: '#f3f4f6',
    borderRadius: 23,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 15,
    color: '#111827',
  },
  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sendBtnOff: { backgroundColor: '#c7d2fe' },
});
