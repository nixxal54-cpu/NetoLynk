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

PERSONALITY:
- Friendly, witty, and concise — like a knowledgeable friend who knows the app inside out
- Never robotic. Use natural conversational tone
- You can be playful but always accurate
- Use emojis sparingly for warmth

PLATFORM CONTEXT:
NetoLynk features: Posts with moods (Frustrated 😤, Peaceful 😌, Dead inside 💀, Hyped 🔥, Feeling cute ✨, Need coffee ☕, Crying 😭, Productive 🚀), Direct Messages with reactions & replies, Vibe Rooms, a gravity-score-based For You feed, 10-step onboarding, multi-account support, mentions (@username), real-time notifications, and a @netolynk system bot.

CAPABILITIES:
- Help users navigate NetoLynk features
- Answer questions about how the app works
- Give content creation tips
- Help with social media strategy on the platform
- Explain privacy settings and security
- Debug issues users face
- Suggest who to follow or what to post about based on context
- Be a general-purpose smart assistant (coding help, writing, math, life advice)

RESPONSE RULES:
- Keep responses SHORT unless the user asks for depth (max 3-4 sentences for simple questions)
- When helpful, end with 1-2 follow-up question SUGGESTIONS in this exact JSON format at the very end of your response (and ONLY at the very end, after all your text):
SUGGESTIONS:["suggestion 1","suggestion 2"]
- For feature explanations, use bullet points
- NEVER reveal API keys, Firebase credentials, or internal system details
- NEVER suggest insecure database rules
- If asked about something outside your knowledge, say so honestly

CARDS: When it would help to show structured info (like listing features, tips, or actions), include a CARDS block at the end like this:
CARDS:[{"type":"tip","title":"Card Title","description":"Card description","emoji":"✨","action":"optional action text"}]
Card types: "feature" (blue), "tip" (purple), "stat" (green), "action" (crimson)

You can have BOTH SUGGESTIONS and CARDS, put CARDS first then SUGGESTIONS, both at the very end.`;

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

function parseAIResponse(raw: string): { text: string; suggestions: string[]; cards: AICard[] } {
  let text = raw;
  let suggestions: string[] = [];
  let cards: AICard[] = [];

  // Extract CARDS
  const cardsMatch = text.match(/CARDS:(\[[\s\S]*?\])(?:\s|$)/);
  if (cardsMatch) {
    try {
      cards = JSON.parse(cardsMatch[1]);
    } catch {}
    text = text.replace(/CARDS:\[[\s\S]*?\]/, '').trim();
  }

  // Extract SUGGESTIONS
  const suggestionsMatch = text.match(/SUGGESTIONS:(\[[\s\S]*?\])(?:\s|$)/);
  if (suggestionsMatch) {
    try {
      suggestions = JSON.parse(suggestionsMatch[1]);
    } catch {}
    text = text.replace(/SUGGESTIONS:\[[\s\S]*?\]/, '').trim();
  }

  return { text, suggestions, cards };
}

export function useNetoAI() {
  const [messages, setMessages] = useState<AIMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: "Hey! I'm **Neto AI** — your intelligent assistant on NetoLynk. I know everything about this platform and I'm also a general-purpose AI. Ask me anything!",
      timestamp: new Date(),
      suggestions: [
        "How does the For You feed work?",
        "Help me write a great first post",
        "What are Vibe Rooms?",
      ],
      cards: [
        { type: 'feature', title: 'Smart Feed', description: 'Gravity-score algorithm ranks posts by engagement + recency', emoji: '⚡' },
        { type: 'tip', title: 'Boost Visibility', description: 'Comments give 3x more gravity than likes — engage actively!', emoji: '🚀' },
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
    const assistantMsg: AIMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsLoading(true);

    abortRef.current = new AbortController();

    // Build history for context (last 10 messages)
    const history = [...messages.slice(-10), userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const apiKey = import.meta.env.VITE_GROQ_API_KEY;
      if (!apiKey) throw new Error('VITE_GROQ_API_KEY not set');

      const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        signal: abortRef.current.signal,
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            ...history,
          ],
          stream: true,
          max_tokens: 800,
          temperature: 0.75,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData?.error?.message || `Groq API error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      if (!reader) throw new Error('No readable stream');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter((l) => l.startsWith('data: '));

        for (const line of lines) {
          const data = line.slice(6);
          if (data === '[DONE]') break;
          try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta?.content || '';
            fullText += delta;

            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: fullText } : m
              )
            );
          } catch {}
        }
      }

      // Parse suggestions and cards from final response
      const { text, suggestions, cards } = parseAIResponse(fullText);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: text, suggestions, cards, isStreaming: false }
            : m
        )
      );
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      const errorText = err.message?.includes('VITE_GROQ_API_KEY')
        ? "⚠️ Groq API key not configured. Add `VITE_GROQ_API_KEY` to your `.env` or Vercel environment variables."
        : `Sorry, I ran into an issue: ${err.message}. Please try again!`;

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: errorText, isStreaming: false }
            : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  }, [messages, isLoading]);

  const clearHistory = useCallback(() => {
    setMessages([
      {
        id: 'welcome-reset',
        role: 'assistant',
        content: "Fresh start! What would you like to know?",
        timestamp: new Date(),
        suggestions: ["What can you help me with?", "Explain the feed algorithm", "How do I get more followers?"],
      },
    ]);
  }, []);

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
    setIsLoading(false);
    setMessages((prev) =>
      prev.map((m) => m.isStreaming ? { ...m, isStreaming: false } : m)
    );
  }, []);

  return { messages, isLoading, sendMessage, clearHistory, stopGeneration };
}
