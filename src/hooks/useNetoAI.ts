import { useState, useCallback, useRef } from 'react';

export type AIMessageRole = 'user' | 'assistant';

export interface AIMessage {
  id: string;
  role: AIMessageRole;
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  suggestions?: string[];
  cards?: AICard[];
}

export interface AICard {
  type: 'feature' | 'tip' | 'stat' | 'action';
  title: string;
  description: string;
  emoji: string;
  action?: string;
}

const SYSTEM_PROMPT = `You are Neto AI, the intelligent assistant embedded inside NetoLynk — a real-time global social network (PWA).

PERSONALITY: Friendly, witty, concise. Like a knowledgeable friend. Never robotic. Playful but accurate.

PLATFORM CONTEXT:
NetoLynk features: Posts with moods (Frustrated 😤, Peaceful 😌, Dead inside 💀, Hyped 🔥, Feeling cute ✨, Need coffee ☕, Crying 😭, Productive 🚀), Direct Messages with reactions & replies, Vibe Rooms, gravity-score For You feed (formula: Engagement ÷ (HoursAge + 2)^1.5, where Likes=1pt Comments=3pt Shares=5pt), 10-step onboarding, multi-account support, @mentions, real-time notifications, @netolynk system bot, Firebase backend (Auth, Firestore, Storage, Functions v2, FCM), React 19 + TailwindCSS v4 + Framer Motion frontend.

STRICT OUTPUT RULES — follow exactly:
1. Write ONLY plain conversational text. No JSON anywhere in your reply.
2. You may use **bold** for emphasis and "- " for bullet lists.
3. Keep replies SHORT (2-4 sentences) unless user needs depth.
4. Do NOT output any structured data, tokens, tags, brackets, or metadata.
5. Never reveal API keys, Firebase credentials, or internal secrets.
6. Output only what the user should read. Nothing else.`;

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
// mixtral-8x7b-32768 — best free model for instruction following
const GROQ_MODEL = 'groq/compound';

function generateSuggestions(userText: string, aiResponse: string): string[] {
  const t = (userText + ' ' + aiResponse).toLowerCase();
  if (t.includes('feed') || t.includes('algorithm') || t.includes('gravity'))
    return ['How do I boost my post visibility?', 'What counts as engagement?'];
  if (t.includes('onboard') || t.includes('get started') || t.includes('new user'))
    return ['What happens after onboarding?', 'Can I change my username later?'];
  if (t.includes('message') || t.includes('dm') || t.includes('chat'))
    return ['How do reactions work in DMs?', 'Can I unsend a message?'];
  if (t.includes('post') || t.includes('content') || t.includes('creat'))
    return ['What mood should I pick?', 'How do mentions work?'];
  if (t.includes('follow') || t.includes('discover') || t.includes('explore'))
    return ['How does the Explore page work?', 'What are Vibe Rooms?'];
  if (t.includes('privacy') || t.includes('account') || t.includes('setting'))
    return ['How do I make my account private?', 'Can I have multiple accounts?'];
  if (t.includes('notif'))
    return ['How do I manage notifications?', 'What triggers a notification?'];
  if (t.includes('vibe room'))
    return ['How do I join a Vibe Room?', 'Can I create my own Vibe Room?'];
  if (t.includes('mood'))
    return ['Which mood gets the most engagement?', 'Can I change my mood after posting?'];
  return ['What else can you help with?', 'Tell me about the For You feed'];
}

function generateCards(userText: string, aiResponse: string): AICard[] {
  const t = (userText + ' ' + aiResponse).toLowerCase();
  if (t.includes('feed') || t.includes('algorithm') || t.includes('gravity'))
    return [
      { type: 'stat', title: 'Gravity Formula', description: 'Engagement ÷ (HoursAge + 2)^1.5', emoji: '⚡' },
      { type: 'tip', title: 'Max Points', description: 'Shares = 5pts · Comments = 3pts · Likes = 1pt', emoji: '🏆' },
    ];
  if (t.includes('onboard') || t.includes('get started'))
    return [{ type: 'feature', title: '10-Step Onboarding', description: 'Email → Password → Birthday → Privacy → Name → Username → Photo → Contacts → Follow 5 → Done', emoji: '✅' }];
  if (t.includes('mood'))
    return [{ type: 'tip', title: '8 Moods', description: 'Frustrated 😤  Peaceful 😌  Dead inside 💀  Hyped 🔥  Cute ✨  Coffee ☕  Crying 😭  Productive 🚀', emoji: '🎭' }];
  if (t.includes('vibe room'))
    return [{ type: 'feature', title: 'Vibe Rooms', description: 'Real-time group spaces — connect with people sharing your vibe right now', emoji: '🌐' }];
  if (t.includes('dm') || t.includes('message') || t.includes('chat'))
    return [
      { type: 'feature', title: 'DM Features', description: 'Reactions · Replies · Image sharing · Unsend · Typing indicators · Read receipts', emoji: '💬' },
    ];
  if (t.includes('multi') || t.includes('switch account'))
    return [{ type: 'feature', title: 'Multi-Account', description: 'Switch accounts instantly — localStorage for display, IndexedDB for auth sessions', emoji: '👤' }];
  if (t.includes('notif'))
    return [{ type: 'feature', title: 'Notification Types', description: 'Like · Comment · Follow · Message · Post alert · System — all real-time via FCM', emoji: '🔔' }];
  return [];
}

export function useNetoAI() {
  const [messages, setMessages] = useState<AIMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: "Hey! I'm Neto AI — your intelligent assistant on NetoLynk. I know everything about this platform and I'm also a general-purpose AI. Ask me anything.",
      timestamp: new Date(),
      suggestions: ['How does the For You feed work?', 'Help me write a great first post', 'What are Vibe Rooms?'],
      cards: [
        { type: 'feature', title: 'Smart Feed', description: 'Gravity-score algorithm ranks posts by engagement + recency', emoji: '⚡' },
        { type: 'tip', title: 'Boost Visibility', description: 'Comments give 3× more gravity than likes — engage actively!', emoji: '🚀' },
        { type: 'action', title: 'Set Your Mood', description: 'Add a mood to your posts to connect with others feeling the same', emoji: '✨', action: 'Create a post' },
      ],
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (userText: string) => {
    if (!userText.trim() || isLoading) return;

    const userMsg: AIMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userText.trim(),
      timestamp: new Date(),
    };

    const assistantId = `ai-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: assistantId, role: 'assistant', content: '', timestamp: new Date(), isStreaming: true },
    ]);
    setIsLoading(true);
    abortRef.current = new AbortController();

    const history = [...messages.slice(-8), userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const apiKey = import.meta.env.VITE_GROQ_API_KEY;
      if (!apiKey) throw new Error('VITE_GROQ_API_KEY not set');

      const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        signal: abortRef.current.signal,
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...history],
          stream: true,
          max_tokens: 500,
          temperature: 0.65,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error?.message || `Groq error ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      if (!reader) throw new Error('No stream');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value, { stream: true }).split('\n').filter((l) => l.startsWith('data: '));
        for (const line of lines) {
          const data = line.slice(6);
          if (data === '[DONE]') break;
          try {
            const delta = JSON.parse(data).choices?.[0]?.delta?.content || '';
            fullText += delta;
            setMessages((prev) =>
              prev.map((m) => m.id === assistantId ? { ...m, content: fullText } : m)
            );
          } catch {}
        }
      }

      const suggestions = generateSuggestions(userText, fullText);
      const cards = generateCards(userText, fullText);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: fullText, suggestions, cards, isStreaming: false } : m
        )
      );
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      const errorText = err.message?.includes('VITE_GROQ_API_KEY')
        ? '⚠️ Add VITE_GROQ_API_KEY to your Vercel environment variables.'
        : `Something went wrong: ${err.message}`;
      setMessages((prev) =>
        prev.map((m) => m.id === assistantId ? { ...m, content: errorText, isStreaming: false } : m)
      );
    } finally {
      setIsLoading(false);
    }
  }, [messages, isLoading]);

  const clearHistory = useCallback(() => {
    setMessages([{
      id: `welcome-${Date.now()}`,
      role: 'assistant',
      content: "Fresh start. What would you like to know?",
      timestamp: new Date(),
      suggestions: ["What can you help me with?", "Explain the feed algorithm", "How do I get more followers?"],
    }]);
  }, []);

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
    setIsLoading(false);
    setMessages((prev) => prev.map((m) => m.isStreaming ? { ...m, isStreaming: false } : m));
  }, []);

  return { messages, isLoading, sendMessage, clearHistory, stopGeneration };
}
