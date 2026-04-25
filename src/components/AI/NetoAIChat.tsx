import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send,
  Sparkles,
  StopCircle,
  Trash2,
  ChevronDown,
  Copy,
  Check,
  Loader2,
  Zap,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useNetoAI, AIMessage, AICard } from '../hooks/useNetoAI';
import { useAuth } from '../context/AuthContext';

// ── Markdown-lite renderer ─────────────────────────────────────────────────

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];

  lines.forEach((line, i) => {
    // Bold
    const parts = line.split(/(\*\*[^*]+\*\*)/g).map((part, j) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={j} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
      }
      // Inline code
      if (part.includes('`')) {
        return part.split(/(`[^`]+`)/g).map((p, k) => {
          if (p.startsWith('`') && p.endsWith('`')) {
            return <code key={k} className="bg-primary/10 text-primary px-1 py-0.5 rounded text-[12px] font-mono">{p.slice(1, -1)}</code>;
          }
          return p;
        });
      }
      return part;
    });

    if (line.startsWith('- ') || line.startsWith('• ')) {
      nodes.push(
        <div key={i} className="flex gap-2 items-start">
          <span className="text-primary mt-0.5 text-xs">▸</span>
          <span>{parts.map((p, j) => <React.Fragment key={j}>{p}</React.Fragment>)}</span>
        </div>
      );
    } else if (line.trim() === '') {
      nodes.push(<div key={i} className="h-1" />);
    } else {
      nodes.push(
        <span key={i}>
          {parts.map((p, j) => <React.Fragment key={j}>{p}</React.Fragment>)}
          {i < lines.length - 1 && <br />}
        </span>
      );
    }
  });

  return nodes;
}

// ── Streaming cursor ──────────────────────────────────────────────────────

const StreamCursor: React.FC = () => (
  <span
    className="inline-block w-0.5 h-4 bg-primary/80 ml-0.5 align-middle animate-pulse"
    style={{ animationDuration: '0.6s' }}
  />
);

// ── AI Card ───────────────────────────────────────────────────────────────

const cardStyles: Record<string, string> = {
  feature: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
  tip: 'bg-purple-500/10 border-purple-500/20 text-purple-400',
  stat: 'bg-green-500/10 border-green-500/20 text-green-400',
  action: 'bg-red-800/20 border-red-700/30 text-red-400',
};

const AICardComponent: React.FC<{ card: AICard; onAction?: (action: string) => void }> = ({ card, onAction }) => (
  <div className={cn('border rounded-xl p-3 flex gap-3 items-start transition-all hover:scale-[1.01]', cardStyles[card.type] || cardStyles.tip)}>
    <span className="text-xl flex-shrink-0 mt-0.5">{card.emoji}</span>
    <div className="flex-1 min-w-0">
      <p className="font-semibold text-sm text-foreground leading-tight">{card.title}</p>
      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{card.description}</p>
      {card.action && (
        <button
          onClick={() => onAction?.(card.action!)}
          className="mt-2 text-xs font-medium px-3 py-1 rounded-full bg-foreground/10 hover:bg-foreground/15 transition-colors text-foreground"
        >
          {card.action} →
        </button>
      )}
    </div>
  </div>
);

// ── Message Bubble ─────────────────────────────────────────────────────────

interface AIBubbleProps {
  msg: AIMessage;
  userName?: string;
  userAvatar?: string;
  onSuggestionClick: (s: string) => void;
}

const AIBubble: React.FC<AIBubbleProps> = ({ msg, userName, userAvatar, onSuggestionClick }) => {
  const [copied, setCopied] = useState(false);
  const isUser = msg.role === 'user';

  const handleCopy = () => {
    navigator.clipboard.writeText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn('flex gap-3 group', isUser ? 'flex-row-reverse' : 'flex-row')}>
      {/* Avatar */}
      <div className="flex-shrink-0 mt-1">
        {isUser ? (
          <img
            src={userAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${userName}`}
            alt={userName}
            className="w-8 h-8 rounded-full object-cover"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-700 via-red-900 to-zinc-900 flex items-center justify-center shadow-lg shadow-red-900/30">
            <Sparkles className="w-4 h-4 text-red-300" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className={cn('flex-1 min-w-0 max-w-[85%]', isUser ? 'items-end' : 'items-start', 'flex flex-col gap-2')}>
        {/* Bubble */}
        <div
          className={cn(
            'relative px-4 py-3 rounded-2xl text-sm leading-relaxed',
            isUser
              ? 'bg-primary text-primary-foreground rounded-tr-sm self-end'
              : 'bg-zinc-900/80 border border-white/5 text-foreground rounded-tl-sm self-start w-full'
          )}
        >
          {isUser ? (
            <p>{msg.content}</p>
          ) : (
            <div className="space-y-1 text-[13px]">
              {renderMarkdown(msg.content)}
              {msg.isStreaming && <StreamCursor />}
            </div>
          )}

          {/* Copy button (AI only) */}
          {!isUser && !msg.isStreaming && msg.content && (
            <button
              onClick={handleCopy}
              className="absolute top-2 right-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity bg-white/5 hover:bg-white/10 text-muted-foreground"
              title="Copy"
            >
              {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
            </button>
          )}
        </div>

        {/* AI Cards */}
        {!isUser && msg.cards && msg.cards.length > 0 && !msg.isStreaming && (
          <div className="grid grid-cols-1 gap-2 w-full">
            {msg.cards.map((card, i) => (
              <AICardComponent key={i} card={card} onAction={onSuggestionClick} />
            ))}
          </div>
        )}

        {/* Suggestions */}
        {!isUser && msg.suggestions && msg.suggestions.length > 0 && !msg.isStreaming && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {msg.suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => onSuggestionClick(s)}
                className="text-xs px-3 py-1.5 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 hover:border-primary/40 text-muted-foreground hover:text-foreground transition-all"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Timestamp */}
        <p className="text-[10px] text-muted-foreground/50 px-1">
          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  );
};

// ── Thinking indicator ─────────────────────────────────────────────────────

const ThinkingIndicator: React.FC = () => (
  <div className="flex gap-3">
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-700 via-red-900 to-zinc-900 flex items-center justify-center flex-shrink-0 shadow-lg shadow-red-900/30">
      <Sparkles className="w-4 h-4 text-red-300" />
    </div>
    <div className="bg-zinc-900/80 border border-white/5 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
      <Zap className="w-3 h-3 text-red-400 animate-pulse" />
      <span className="text-xs text-muted-foreground">Neto AI is thinking</span>
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-red-500/60 animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  </div>
);

// ── Main Component ─────────────────────────────────────────────────────────

export const NetoAIChat: React.FC = () => {
  const { user } = useAuth();
  const { messages, isLoading, sendMessage, clearHistory, stopGeneration } = useNetoAI();
  const [input, setInput] = useState('');
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBtn(distFromBottom > 200);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage(input);
    setInput('');
    inputRef.current?.focus();
  };

  const handleSuggestion = (text: string) => {
    sendMessage(text);
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-zinc-950/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-red-700 via-red-900 to-zinc-900 flex items-center justify-center shadow-lg shadow-red-900/40">
            <Sparkles className="w-4 h-4 text-red-300" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="font-bold text-sm">Neto AI</p>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-900/30 text-red-400 border border-red-800/30 font-medium">BETA</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {isLoading ? (
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  Generating...
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  Online · Llama 3.3 70B
                </span>
              )}
            </p>
          </div>
        </div>
        <button
          onClick={clearHistory}
          title="Clear history"
          className="p-2 hover:bg-accent rounded-full text-muted-foreground hover:text-foreground transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-5 scroll-smooth"
      >
        {/* Ambient background effect */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden opacity-20">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full bg-red-900 blur-[80px]" />
        </div>

        {messages.map((msg) => (
          <AIBubble
            key={msg.id}
            msg={msg}
            userName={user?.displayName || user?.username}
            userAvatar={user?.profileImage}
            onSuggestionClick={handleSuggestion}
          />
        ))}

        {/* Show thinking state ONLY when loading and last message is user */}
        {isLoading && messages[messages.length - 1]?.role === 'user' && (
          <ThinkingIndicator />
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Scroll to bottom button */}
      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-24 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-full text-xs font-medium shadow-lg hover:opacity-90 transition-all z-10"
        >
          <ChevronDown className="w-3.5 h-3.5" />
          New messages
        </button>
      )}

      {/* Input area */}
      <div className="p-4 border-t border-border bg-zinc-950/30">
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Neto AI anything…"
              disabled={isLoading}
              className="w-full bg-zinc-900/80 border border-white/10 focus:border-red-800/50 rounded-2xl py-3 pl-4 pr-4 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors disabled:opacity-50"
            />
          </div>

          {isLoading ? (
            <button
              type="button"
              onClick={stopGeneration}
              className="p-3 bg-red-900/40 border border-red-800/30 text-red-400 rounded-full hover:bg-red-900/60 transition-all flex-shrink-0"
              title="Stop generation"
            >
              <StopCircle className="w-5 h-5" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="p-3 bg-primary text-primary-foreground rounded-full disabled:opacity-30 hover:opacity-90 transition-all flex-shrink-0 shadow-lg shadow-primary/20"
            >
              <Send className="w-5 h-5" />
            </button>
          )}
        </form>

        <p className="text-center text-[10px] text-muted-foreground/40 mt-2">
          Powered by Groq · Llama 3.3 70B · Responses may be inaccurate
        </p>
      </div>
    </div>
  );
};
