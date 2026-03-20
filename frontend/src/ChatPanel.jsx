import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const SUGGESTED_QUESTIONS = {
  brief: [
    "What are the biggest risks here?",
    "How does this compare to M13's thesis?",
    "What should I dig into on the call?",
    "What's the burn multiple?",
  ],
  benchmark: [
    "Which company looks most compelling?",
    "Who has the best capital efficiency?",
    "What are the biggest red flags?",
    "How does NRR compare across the cohort?",
  ],
}

export default function ChatPanel({ context, contextType, contextLabel, isOpen, onClose }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (isOpen && inputRef.current) inputRef.current.focus()
  }, [isOpen])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Reset chat when context changes
  useEffect(() => {
    setMessages([])
  }, [contextLabel])

  async function sendMessage(text) {
    const userMsg = text || input.trim()
    if (!userMsg || loading || !context) return

    setInput('')
    const newMessages = [...messages, { role: 'user', content: userMsg }]
    setMessages(newMessages)
    setLoading(true)

    // Add empty assistant message to stream into
    setMessages(prev => [...prev, { role: 'assistant', content: '' }])

    try {
      const resp = await fetch('/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg,
          context,
          context_type: contextType,
          context_label: contextLabel,
          history: newMessages.slice(-10).map(m => ({ role: m.role, content: m.content })),
        }),
      })

      if (!resp.ok) throw new Error(`Server error: ${resp.status}`)

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.type === 'content') {
              setMessages(prev => {
                const updated = [...prev]
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  content: updated[updated.length - 1].content + data.text,
                }
                return updated
              })
            } else if (data.type === 'done') {
              setLoading(false)
            }
          } catch { /* skip */ }
        }
      }
    } catch (e) {
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = { role: 'assistant', content: `Error: ${e.message}` }
        return updated
      })
      setLoading(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const suggestions = SUGGESTED_QUESTIONS[contextType] || []
  const hasContext = !!context

  return (
    <div style={{
      width: isOpen ? 360 : 0,
      minWidth: isOpen ? 360 : 0,
      borderLeft: isOpen ? '1px solid var(--border)' : 'none',
      background: 'var(--surface)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      transition: 'width 0.2s ease, min-width 0.2s ease',
      flexShrink: 0,
    }}>
      {isOpen && (
        <>
          {/* Header */}
          <div style={{
            padding: '14px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>Ask about this</div>
              <div style={{
                fontSize: 11, color: 'var(--muted)', marginTop: 1,
                maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {contextLabel || 'No context loaded yet'}
              </div>
            </div>
            <button onClick={onClose} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--muted)', fontSize: 18, padding: '2px 6px',
              borderRadius: 4, lineHeight: 1, fontFamily: 'inherit',
            }}
              onMouseEnter={e => e.currentTarget.style.background = '#f0eeea'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >×</button>
          </div>

          {/* Messages */}
          <div style={{
            flex: 1, overflowY: 'auto',
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}>
            {!hasContext && (
              <div style={{
                textAlign: 'center', padding: '32px 16px',
                color: 'var(--muted)', fontSize: 12, lineHeight: 1.6,
              }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>💬</div>
                Generate a brief or run a benchmark first, then ask questions about it here.
              </div>
            )}

            {hasContext && messages.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                  Suggested questions
                </p>
                {suggestions.map((q, i) => (
                  <button key={i} onClick={() => sendMessage(q)} style={{
                    textAlign: 'left', padding: '9px 12px',
                    background: '#f5f4f0', border: '1px solid var(--border)',
                    borderRadius: 8, fontSize: 12, color: 'var(--navy)',
                    cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1.4,
                    transition: 'all 0.15s',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#eff6ff'; e.currentTarget.style.borderColor = 'var(--accent)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#f5f4f0'; e.currentTarget.style.borderColor = 'var(--border)' }}
                  >{q}</button>
                ))}
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}>
                <div style={{
                  maxWidth: '88%',
                  padding: msg.role === 'user' ? '8px 12px' : '0',
                  background: msg.role === 'user' ? 'var(--accent)' : 'transparent',
                  color: msg.role === 'user' ? '#fff' : 'var(--navy)',
                  borderRadius: msg.role === 'user' ? '12px 12px 3px 12px' : 0,
                  fontSize: 13,
                  lineHeight: 1.55,
                }}>
                  {msg.role === 'user' ? (
                    msg.content
                  ) : (
                    <div className="chat-md">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content || ''}
                      </ReactMarkdown>
                      {loading && i === messages.length - 1 && !msg.content && (
                        <TypingDots />
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: '12px 14px',
            borderTop: '1px solid var(--border)',
            flexShrink: 0,
          }}>
            <div style={{
              display: 'flex', gap: 8, alignItems: 'flex-end',
            }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={hasContext ? "Ask anything about this..." : "Generate content first..."}
                disabled={!hasContext || loading}
                rows={1}
                style={{
                  flex: 1, padding: '9px 12px',
                  border: '1px solid var(--border)', borderRadius: 8,
                  fontSize: 13, outline: 'none', background: '#fafaf8',
                  color: '#1a1a1a', fontFamily: 'inherit', resize: 'none',
                  lineHeight: 1.4, maxHeight: 100, overflow: 'auto',
                  opacity: hasContext ? 1 : 0.5,
                }}
                onInput={e => {
                  e.target.style.height = 'auto'
                  e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px'
                }}
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || !hasContext || loading}
                style={{
                  width: 36, height: 36, borderRadius: 8, border: 'none',
                  background: !input.trim() || !hasContext || loading ? '#e8e6e0' : 'var(--accent)',
                  cursor: !input.trim() || !hasContext || loading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, transition: 'background 0.15s',
                }}
              >
                {loading
                  ? <Spinner size={14} />
                  : <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path d="M22 2L11 13M22 2L15 22L11 13M11 13L2 9L22 2" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                }
              </button>
            </div>
            <p style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6, textAlign: 'center' }}>
              Enter to send · Shift+Enter for new line
            </p>
          </div>
        </>
      )}

      <style>{`
        .chat-md p { margin: 0 0 6px; font-size: 13px; line-height: 1.55; color: var(--navy); }
        .chat-md ul { margin: 4px 0 6px; padding-left: 16px; }
        .chat-md li { font-size: 13px; line-height: 1.55; margin-bottom: 2px; color: var(--navy); }
        .chat-md strong { font-weight: 600; }
        .chat-md p:last-child { margin-bottom: 0; }
        .chat-md h3 { font-size: 13px; font-weight: 600; margin: 8px 0 4px; }
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: 4, padding: '4px 0' }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 6, height: 6, borderRadius: '50%',
          background: 'var(--muted)',
          animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
          display: 'inline-block',
        }} />
      ))}
    </div>
  )
}

function Spinner({ size = 14 }) {
  return (
    <span style={{
      display: 'inline-block', width: size, height: size,
      border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff',
      borderRadius: '50%', animation: 'spin 0.7s linear infinite',
    }} />
  )
}