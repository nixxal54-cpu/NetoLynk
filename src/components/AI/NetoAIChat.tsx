import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Sparkles, StopCircle, Trash2, Copy, Check, Zap } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useNetoAI, AIMessage, AICard } from '../../hooks/useNetoAI';
import { useAuth } from '../../context/AuthContext';

// ── Markdown renderer — inline only, no wrapper div ──────────────────────────

function renderInline(text: string): React.ReactNode {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i} className="font-semibold text-white/95">{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`'))
      return (
        <code key={i} className="text-red-300 font-mono text-[0.85em] bg-red-950/40 px-1 rounded">
          {part.slice(1, -1)}
        </code>
      );
    return <span key={i}>{part}</span>;
  });
}

function renderText(text: string): React.ReactNode {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    if (line.startsWith('- ') || line.startsWith('• ')) {
      return (
        <div key={i} className="flex gap-2.5 items-baseline my-1">
          <span className="text-red-500/70 text-xs mt-0.5 flex-shrink-0 select-none">◆</span>
          <span className="text-white/80 leading-relaxed break-words min-w-0">{renderInline(line.slice(2))}</span>
        </div>
      );
    }
    if (line.trim() === '') return <div key={i} className="h-2" />;
    return (
      <div key={i} className="leading-relaxed break-words text-white/85">
        {renderInline(line)}
      </div>
    );
  });
}

// ── Streaming cursor ──────────────────────────────────────────────────────────

const Cursor = () => (
  <span
    className="inline-block w-[2px] h-[1em] bg-red-400/80 ml-0.5 align-middle rounded-full"
    style={{ animation: 'blink 0.7s step-end infinite' }}
  />
);

// ── AI Card ───────────────────────────────────────────────────────────────────

const cardAccent: Record<string, { border: string; glow: string; label: string }> = {
  feature: { border: 'border-blue-500/25',  glow: 'shadow-blue-900/20',  label: 'text-blue-400' },
  tip:     { border: 'border-violet-500/25', glow: 'shadow-violet-900/20', label: 'text-violet-400' },
  stat:    { border: 'border-emerald-500/25',glow: 'shadow-emerald-900/20',label: 'text-emerald-400' },
  action:  { border: 'border-red-700/30',    glow: 'shadow-red-900/20',    label: 'text-red-400' },
};

const AICardComponent: React.FC<{ card: AICard; onAction?: (a: string) => void; delay: number }> = ({ card, onAction, delay }) => {
  const style = cardAccent[card.type] || cardAccent.tip;
  return (
    <div
      className={cn(
        'border rounded-2xl p-3.5 flex gap-3 items-start backdrop-blur-sm',
        'bg-white/[0.03] hover:bg-white/[0.05] transition-all duration-300',
        'shadow-lg', style.border, style.glow,
      )}
      style={{ animationDelay: `${delay}ms`, animation: 'fadeUp 0.4s ease both' }}
    >
      <span className="text-xl flex-shrink-0 leading-none mt-0.5">{card.emoji}</span>
      <div className="flex-1 min-w-0">
        <p className={cn('text-[11px] font-semibold uppercase tracking-wider mb-1', style.label)}>{card.title}</p>
        <p className="text-xs text-white/60 leading-relaxed break-words">{card.description}</p>
        {card.action && (
          <button
            onClick={() => onAction?.(card.action!)}
            className="mt-2 text-xs font-medium text-white/70 hover:text-white border border-white/10 hover:border-white/25 px-3 py-1 rounded-full transition-all"
          >
            {card.action} →
          </button>
        )}
      </div>
    </div>
  );
};

// ── User message pill ─────────────────────────────────────────────────────────

const UserBubble: React.FC<{ msg: AIMessage; avatar?: string }> = ({ msg, avatar }) => (
  <div className="flex justify-end gap-2.5 items-end" style={{ animation: 'fadeUp 0.3s ease both' }}>
    <div className="max-w-[72%] bg-red-600/20 border border-red-500/20 backdrop-blur-sm rounded-2xl rounded-br-md px-4 py-2.5">
      <p className="text-sm text-white/90 leading-relaxed break-words">{msg.content}</p>
    </div>
    {avatar
      ? <img src={avatar} className="w-7 h-7 rounded-full object-cover flex-shrink-0 ring-1 ring-white/10" alt="" />
      : <div className="w-7 h-7 rounded-full bg-white/10 flex-shrink-0" />
    }
  </div>
);

// ── AI response — text lives ON the background ────────────────────────────────

const AIResponse: React.FC<{ msg: AIMessage; onSuggestion: (s: string) => void }> = ({ msg, onSuggestion }) => {
  const [copied, setCopied] = useState(false);
  const isEmpty = !msg.content && msg.isStreaming;

  const handleCopy = () => {
    navigator.clipboard.writeText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex gap-3 items-start group" style={{ animation: 'fadeUp 0.3s ease both' }}>
      {/* Neto AI orb — small, floats on the left */}
      <div className="flex-shrink-0 mt-1">
        <div className="w-7 h-7 rounded-full flex items-center justify-center relative"
          style={{
            background: 'radial-gradient(circle at 35% 35%, #7f1d1d, #3f0000)',
            boxShadow: '0 0 12px #ef444430',
          }}
        >
          <Sparkles className="w-3.5 h-3.5 text-red-300" />
          {msg.isStreaming && (
            <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500"
              style={{ animation: 'pulse 1s ease infinite' }} />
          )}
        </div>
      </div>

      {/* Text directly on background — NO box, NO border, NO background */}
      <div className="flex-1 min-w-0 space-y-3">
        {isEmpty ? (
          <div className="flex items-center gap-2 py-1">
            <Zap className="w-3.5 h-3.5 text-red-400/60 animate-pulse" />
            <div className="flex gap-1">
              {[0,1,2].map(i => (
                <span key={i} className="w-1.5 h-1.5 rounded-full bg-red-400/40 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Raw text on background — this IS the design */}
            <div className="text-[14px] font-light tracking-wide space-y-0.5 relative pr-6">
              {renderText(msg.content)}
              {msg.isStreaming && <Cursor />}

              {/* Copy — only visible on hover, floats top-right */}
              {!msg.isStreaming && msg.content && (
                <button
                  onClick={handleCopy}
                  className="absolute top-0 right-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity text-white/30 hover:text-white/70"
                >
                  {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                </button>
              )}
            </div>

            {/* Cards — materialise below the text */}
            {!msg.isStreaming && msg.cards && msg.cards.length > 0 && (
              <div className="grid grid-cols-1 gap-2 pt-1">
                {msg.cards.map((card, i) => (
                  <AICardComponent key={i} card={card} delay={i * 80} onAction={onSuggestion} />
                ))}
              </div>
            )}

            {/* Suggestion chips */}
            {!msg.isStreaming && msg.suggestions && msg.suggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {msg.suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => onSuggestion(s)}
                    style={{ animationDelay: `${i * 60}ms`, animation: 'fadeUp 0.4s ease both' }}
                    className="text-xs px-3 py-1.5 rounded-full border border-white/8 text-white/45 hover:text-white/80 hover:border-red-500/40 hover:bg-red-950/20 transition-all duration-200"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Timestamp */}
            <p className="text-[10px] text-white/20 pt-0.5">
              {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </>
        )}
      </div>
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

export const NetoAIChat: React.FC = () => {
  const { user } = useAuth();
  const { messages, isLoading, sendMessage, clearHistory, stopGeneration } = useNetoAI();
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage(input);
    setInput('');
  };

  return (
    <>
      {/* Keyframe styles */}
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50%       { transform: scale(1.4); opacity: 0.4; }
        }
      `}</style>

      <div className="flex flex-col h-full w-full overflow-hidden" style={{ background: 'var(--background)' }}>

        {/* Header — minimal, no heavy box */}
        <div className="px-5 py-3.5 flex items-center justify-between border-b border-white/5 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
              style={{
                background: 'radial-gradient(circle at 35% 35%, #7f1d1d, #3f0000)',
                boxShadow: '0 0 16px #ef444425',
              }}
            >
              <Sparkles className="w-4 h-4 text-red-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-white/90 tracking-wide">Neto AI</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-950/60 text-red-400 border border-red-800/30 font-medium tracking-wider">BETA</span>
              </div>
              <p className="text-[11px] text-white/30 flex items-center gap-1.5 mt-0.5">
                {isLoading
                  ? <><span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" style={{animation:'pulse 1s ease infinite'}} />generating</>
                  : <><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />mixtral · groq</>
                }
              </p>
            </div>
          </div>
          <button
            onClick={clearHistory}
            className="p-2 rounded-full text-white/20 hover:text-white/60 hover:bg-white/5 transition-all"
            title="Clear"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {/* Messages — scroll area */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-5 space-y-7"
          style={{ scrollbarWidth: 'thin', scrollbarColor: '#ffffff10 transparent' }}
        >
          {messages.map((msg) =>
            msg.role === 'user'
              ? <UserBubble key={msg.id} msg={msg} avatar={user?.profileImage} />
              : <AIResponse key={msg.id} msg={msg} onSuggestion={(s) => { sendMessage(s); }} />
          )}
          <div ref={endRef} />
        </div>

        {/* Input — floats at bottom */}
        <div className="px-4 pb-4 pt-3 border-t border-white/5 flex-shrink-0">
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything…"
              disabled={isLoading}
              className="flex-1 min-w-0 rounded-2xl py-3 px-4 text-sm text-white/85 placeholder:text-white/25 outline-none transition-all disabled:opacity-40"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(239,68,68,0.35)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
            />
            {isLoading ? (
              <button
                type="button"
                onClick={stopGeneration}
                className="p-3 rounded-full text-red-400 border border-red-800/30 bg-red-950/30 hover:bg-red-950/50 transition-all flex-shrink-0"
              >
                <StopCircle className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="p-3 rounded-full flex-shrink-0 transition-all disabled:opacity-25"
                style={{
                  background: input.trim() ? 'radial-gradient(circle, #7f1d1d, #450a0a)' : undefined,
                  backgroundColor: input.trim() ? undefined : 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(239,68,68,0.2)',
                }}
              >
                <Send className="w-4 h-4 text-white/80" />
              </button>
            )}
          </form>
          <p className="text-center text-[10px] text-white/15 mt-2 tracking-wide">
            Mixtral 8×7B · Groq · NetoLynk AI
          </p>
        </div>
      </div>
    </>
  );
};
