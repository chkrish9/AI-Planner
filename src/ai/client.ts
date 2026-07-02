import * as SecureStore from 'expo-secure-store';
import { buildSystemPrompt } from './system-prompt';
import { AI_TOOLS, executeTool } from './tools';
import { saveMessage, getRecentMessages } from '../db/queries';

const API_KEY_STORE = 'anthropic_api_key';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

export async function getApiKey(): Promise<string | null> {
  return SecureStore.getItemAsync(API_KEY_STORE);
}

export async function saveApiKey(key: string): Promise<void> {
  await SecureStore.setItemAsync(API_KEY_STORE, key);
}

export async function deleteApiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(API_KEY_STORE);
}

export interface StreamChunk {
  type: 'text' | 'tool_start' | 'tool_done' | 'done' | 'error';
  text?: string;
  toolName?: string;
  toolResult?: unknown;
  error?: string;
}

type MessageParam = { role: 'user' | 'assistant'; content: string | ContentBlock[] };
type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

async function callAnthropic(
  apiKey: string,
  messages: MessageParam[],
  systemPrompt: string
): Promise<{ content: ContentBlock[]; stop_reason: string }> {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      tools: AI_TOOLS,
      messages,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${err}`);
  }

  return response.json();
}

export async function sendMessage(
  userText: string,
  onChunk: (chunk: StreamChunk) => void
): Promise<void> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    onChunk({ type: 'error', error: 'No API key set. Go to Settings to add your Anthropic API key.' });
    return;
  }

  await saveMessage('user', userText);

  const history = await getRecentMessages(50);
  const messages: MessageParam[] = history.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  const systemPrompt = buildSystemPrompt();
  let assistantText = '';

  try {
    let currentMessages = messages;

    while (true) {
      const response = await callAnthropic(apiKey, currentMessages, systemPrompt);

      let thisText = '';
      const toolUseBlocks: Extract<ContentBlock, { type: 'tool_use' }>[] = [];

      for (const block of response.content) {
        if (block.type === 'text') {
          thisText += block.text;
          onChunk({ type: 'text', text: block.text });
        } else if (block.type === 'tool_use') {
          toolUseBlocks.push(block as Extract<ContentBlock, { type: 'tool_use' }>);
        }
      }

      if (thisText) assistantText += thisText;

      if (response.stop_reason === 'end_turn' || toolUseBlocks.length === 0) break;

      const toolResults: ContentBlock[] = [];
      for (const toolBlock of toolUseBlocks) {
        onChunk({ type: 'tool_start', toolName: toolBlock.name });
        const result = await executeTool(toolBlock.name, toolBlock.input);
        onChunk({ type: 'tool_done', toolName: toolBlock.name, toolResult: result });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolBlock.id,
          content: JSON.stringify(result.data ?? result.error),
        });
      }

      currentMessages = [
        ...currentMessages,
        { role: 'assistant', content: response.content },
        { role: 'user', content: toolResults },
      ];
    }

    if (assistantText) {
      await saveMessage('assistant', assistantText);
    }
    onChunk({ type: 'done' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    onChunk({ type: 'error', error: msg });
  }
}
