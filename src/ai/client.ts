import { buildSystemPrompt } from './system-prompt';
import { AI_TOOLS, executeTool } from './tools';
import { saveMessage, getRecentMessages } from '../db/queries';
import {
  getProviderKey,
  getActiveProvider,
  getProviderConfig,
  type ProviderId,
} from './provider-config';

// ─── Backward-compat exports used by chat.tsx ─────────────────────────────

export async function getApiKey(): Promise<string | null> {
  const id = await getActiveProvider();
  return getProviderKey(id);
}

// ─── Public types ──────────────────────────────────────────────────────────

export interface StreamChunk {
  type: 'text' | 'tool_start' | 'tool_done' | 'done' | 'error';
  text?: string;
  toolName?: string;
  toolResult?: unknown;
  error?: string;
}

interface ToolCall { id: string; name: string; input: Record<string, unknown> }
interface LLMResponse { text: string; toolCalls: ToolCall[]; done: boolean }

// ─── Anthropic ────────────────────────────────────────────────────────────

type AnthropicBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

type AnthropicMsg = { role: 'user' | 'assistant'; content: string | AnthropicBlock[] };

async function callAnthropic(apiKey: string, messages: AnthropicMsg[], system: string): Promise<LLMResponse> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: getProviderConfig('anthropic').defaultModel, max_tokens: 2048, system, tools: AI_TOOLS, messages }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const toolCalls: ToolCall[] = [];
  let text = '';
  for (const b of data.content ?? []) {
    if (b.type === 'text') text += b.text;
    else if (b.type === 'tool_use') toolCalls.push({ id: b.id, name: b.name, input: b.input });
  }
  return { text, toolCalls, done: data.stop_reason === 'end_turn' || toolCalls.length === 0 };
}

async function runAnthropicLoop(
  apiKey: string,
  history: Array<{ role: string; content: string }>,
  system: string,
  onChunk: (c: StreamChunk) => void
): Promise<string> {
  let current: AnthropicMsg[] = history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  let accumulated = '';
  while (true) {
    const resp = await callAnthropic(apiKey, current, system);
    if (resp.text) { accumulated += resp.text; onChunk({ type: 'text', text: resp.text }); }
    if (resp.done) break;
    const assistantBlocks: AnthropicBlock[] = resp.text ? [{ type: 'text', text: resp.text }] : [];
    const toolResults: AnthropicBlock[] = [];
    for (const tc of resp.toolCalls) {
      assistantBlocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
      onChunk({ type: 'tool_start', toolName: tc.name });
      const result = await executeTool(tc.name, tc.input);
      onChunk({ type: 'tool_done', toolName: tc.name, toolResult: result });
      toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: JSON.stringify(result.data ?? result.error) });
    }
    current = [...current, { role: 'assistant', content: assistantBlocks }, { role: 'user', content: toolResults }];
  }
  return accumulated;
}

// ─── OpenAI ───────────────────────────────────────────────────────────────

type OpenAIRole = 'system' | 'user' | 'assistant' | 'tool';
interface OpenAIMsg { role: OpenAIRole; content: string | null; tool_calls?: OAIToolCall[]; tool_call_id?: string; name?: string }
interface OAIToolCall { id: string; type: 'function'; function: { name: string; arguments: string } }

function toOpenAITools() {
  return AI_TOOLS.map((t) => ({ type: 'function' as const, function: { name: t.name, description: t.description, parameters: t.input_schema } }));
}

async function callOpenAI(apiKey: string, messages: OpenAIMsg[], system: string): Promise<LLMResponse> {
  const allMsgs: OpenAIMsg[] = [{ role: 'system', content: system }, ...messages];
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: getProviderConfig('openai').defaultModel, max_tokens: 2048, messages: allMsgs, tools: toOpenAITools(), tool_choice: 'auto' }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const msg = data.choices?.[0]?.message;
  const text = msg?.content ?? '';
  const toolCalls: ToolCall[] = (msg?.tool_calls ?? []).map((tc: OAIToolCall) => ({
    id: tc.id, name: tc.function.name, input: JSON.parse(tc.function.arguments || '{}'),
  }));
  return { text, toolCalls, done: data.choices?.[0]?.finish_reason === 'stop' || toolCalls.length === 0 };
}

async function runOpenAILoop(
  apiKey: string,
  history: Array<{ role: string; content: string }>,
  system: string,
  onChunk: (c: StreamChunk) => void
): Promise<string> {
  let current: OpenAIMsg[] = history.map((m) => ({ role: m.role as OpenAIRole, content: m.content }));
  let accumulated = '';
  while (true) {
    const resp = await callOpenAI(apiKey, current, system);
    if (resp.text) { accumulated += resp.text; onChunk({ type: 'text', text: resp.text }); }
    if (resp.done) break;
    current.push({
      role: 'assistant', content: resp.text || null,
      tool_calls: resp.toolCalls.map((tc) => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.input) } })),
    });
    for (const tc of resp.toolCalls) {
      onChunk({ type: 'tool_start', toolName: tc.name });
      const result = await executeTool(tc.name, tc.input);
      onChunk({ type: 'tool_done', toolName: tc.name, toolResult: result });
      current.push({ role: 'tool', tool_call_id: tc.id, name: tc.name, content: JSON.stringify(result.data ?? result.error) });
    }
  }
  return accumulated;
}

// ─── Gemini ───────────────────────────────────────────────────────────────

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}
interface GeminiContent { role: 'user' | 'model'; parts: GeminiPart[] }

function toGeminiTools() {
  return [{ functionDeclarations: AI_TOOLS.map((t) => ({ name: t.name, description: t.description, parameters: t.input_schema })) }];
}

async function callGemini(apiKey: string, contents: GeminiContent[], system: string): Promise<LLMResponse> {
  const model = getProviderConfig('google').defaultModel;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents, tools: toGeminiTools(), systemInstruction: { parts: [{ text: system }] }, generationConfig: { maxOutputTokens: 2048 } }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const parts: GeminiPart[] = data.candidates?.[0]?.content?.parts ?? [];
  let text = '';
  const toolCalls: ToolCall[] = [];
  for (const part of parts) {
    if (part.text) text += part.text;
    if (part.functionCall) toolCalls.push({ id: part.functionCall.name, name: part.functionCall.name, input: part.functionCall.args });
  }
  const finishReason = data.candidates?.[0]?.finishReason;
  return { text, toolCalls, done: (finishReason === 'STOP' || finishReason === 'MAX_TOKENS') && toolCalls.length === 0 };
}

async function runGeminiLoop(
  apiKey: string,
  history: Array<{ role: string; content: string }>,
  system: string,
  onChunk: (c: StreamChunk) => void
): Promise<string> {
  let contents: GeminiContent[] = history.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  let accumulated = '';
  while (true) {
    const resp = await callGemini(apiKey, contents, system);
    if (resp.text) { accumulated += resp.text; onChunk({ type: 'text', text: resp.text }); }
    if (resp.done) break;
    const modelParts: GeminiPart[] = [];
    if (resp.text) modelParts.push({ text: resp.text });
    for (const tc of resp.toolCalls) modelParts.push({ functionCall: { name: tc.name, args: tc.input } });
    contents.push({ role: 'model', parts: modelParts });
    const responseParts: GeminiPart[] = [];
    for (const tc of resp.toolCalls) {
      onChunk({ type: 'tool_start', toolName: tc.name });
      const result = await executeTool(tc.name, tc.input);
      onChunk({ type: 'tool_done', toolName: tc.name, toolResult: result });
      responseParts.push({ functionResponse: { name: tc.name, response: { result: result.data ?? result.error } } });
    }
    contents.push({ role: 'user', parts: responseParts });
  }
  return accumulated;
}

// ─── Public entry point ───────────────────────────────────────────────────

export async function sendMessage(userText: string, onChunk: (c: StreamChunk) => void): Promise<void> {
  const providerId: ProviderId = await getActiveProvider();
  const apiKey = await getProviderKey(providerId);
  if (!apiKey) {
    const name = getProviderConfig(providerId).name;
    onChunk({ type: 'error', error: `No API key for ${name}. Go to Settings → AI Providers to add one.` });
    return;
  }

  await saveMessage('user', userText);
  const history = await getRecentMessages(50);
  const system = buildSystemPrompt();

  try {
    let assistantText = '';
    if (providerId === 'anthropic') {
      assistantText = await runAnthropicLoop(apiKey, history, system, onChunk);
    } else if (providerId === 'openai') {
      assistantText = await runOpenAILoop(apiKey, history, system, onChunk);
    } else {
      assistantText = await runGeminiLoop(apiKey, history, system, onChunk);
    }
    if (assistantText) await saveMessage('assistant', assistantText);
    onChunk({ type: 'done' });
  } catch (e: unknown) {
    onChunk({ type: 'error', error: e instanceof Error ? e.message : String(e) });
  }
}
