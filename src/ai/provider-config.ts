import * as SecureStore from 'expo-secure-store';

export type ProviderId = 'anthropic' | 'openai' | 'google';

export interface ProviderConfig {
  id: ProviderId;
  name: string;
  subtitle: string;
  keyPlaceholder: string;
  defaultModel: string;
  color: string;
  bgColor: string;
  iconName: string; // Ionicons name
}

export const PROVIDERS: ProviderConfig[] = [
  {
    id: 'anthropic',
    name: 'Claude',
    subtitle: 'Anthropic',
    keyPlaceholder: 'sk-ant-api03-...',
    defaultModel: 'claude-sonnet-4-6',
    color: '#b45309',
    bgColor: '#fef3c7',
    iconName: 'sparkles',
  },
  {
    id: 'openai',
    name: 'ChatGPT',
    subtitle: 'OpenAI',
    keyPlaceholder: 'sk-proj-...',
    defaultModel: 'gpt-4o',
    color: '#059669',
    bgColor: '#d1fae5',
    iconName: 'chatbubble-ellipses',
  },
  {
    id: 'google',
    name: 'Gemini',
    subtitle: 'Google',
    keyPlaceholder: 'AIzaSy...',
    defaultModel: 'gemini-1.5-flash',
    color: '#2563eb',
    bgColor: '#dbeafe',
    iconName: 'globe',
  },
];

const KEY_PREFIX = 'api_key_';
const ACTIVE_PROVIDER_KEY = 'active_provider';

export async function getProviderKey(id: ProviderId): Promise<string | null> {
  return SecureStore.getItemAsync(KEY_PREFIX + id);
}

export async function saveProviderKey(id: ProviderId, key: string): Promise<void> {
  await SecureStore.setItemAsync(KEY_PREFIX + id, key);
}

export async function deleteProviderKey(id: ProviderId): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_PREFIX + id);
}

export async function getActiveProvider(): Promise<ProviderId> {
  const stored = await SecureStore.getItemAsync(ACTIVE_PROVIDER_KEY);
  return (stored as ProviderId) ?? 'anthropic';
}

export async function setActiveProvider(id: ProviderId): Promise<void> {
  await SecureStore.setItemAsync(ACTIVE_PROVIDER_KEY, id);
}

export function getProviderConfig(id: ProviderId): ProviderConfig {
  return PROVIDERS.find((p) => p.id === id)!;
}

// Returns saved keys status for all providers
export async function getAllKeyStatuses(): Promise<Record<ProviderId, string | null>> {
  const [a, o, g] = await Promise.all([
    getProviderKey('anthropic'),
    getProviderKey('openai'),
    getProviderKey('google'),
  ]);
  return { anthropic: a, openai: o, google: g };
}
