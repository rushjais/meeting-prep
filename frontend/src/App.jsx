import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const API_BASE = ''  // proxied via Vite

const EXAMPLE_COMPANIES = [
  { company: 'Cursor', context: 'Series A intro call with co-founder', founder: 'Aman Sanger' },
  { company: 'Perplexity AI', context: 'Follow-up diligence call', founder: 'Aravind Srinivas' },
  { company: 'Codeium', context: 'Initial outreach, seed round exploration', founder: '' },
]

export default function App() {
  const [company, setCompany] = useState('')
  const [context, setContext] = useState('')
  const [founder, setFounder] = useState('')
  const [status, setStatus] = useState('')
  const [brief, setBrief] = useState('')
  const [sources, setSources] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const briefRef = useRef(null)

  useEffect(() => {
    if (briefRef.current && loading) {
      briefRef.current.scrollTop = briefRef.current.scrollHeight
    }
  }, [brief, loading])

  async function handleGenerate() {
    if (!company.trim() || !context.trim()) return
    setLoading(true)
    setBrief('')
    setSources([])
    setError('')
    setStatus('Initializing...')

    try {
      const resp = await fetch(`${API_BASE}/brief/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: company.trim(),
          meeting_context: context.trim(),
          founder_name: founder.trim(),
        }),
      })

      if (!resp.ok) {
        throw new Error(`Server error: ${resp.status}`)
      }

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
            if (data.type === 'status') {
              setStatus(data.text)
            } else if (data.type === 'sources') {
              setSources(data.sources || [])
            } else if (data.type === 'content') {
              setBrief(prev => prev + data.text)
            } else if (data.type === 'done') {
              setStatus('')
              setLoading(false)
            } else if (data.type === 'error') {
              setError(data.text)
              setLoading(false)
            }
          } catch {
            // skip malformed chunk
          }
        }
      }
    } catch (e) {
      setError(e.message || 'Something went wrong.')
      setLoading(false)
    }
  }

  async function handleDownloadPdf() {
    if (!brief) return
    setDownloadingPdf(true)
    try {
      const resp = await fetch(`${API_BASE}/brief/pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          markdown_content: brief,
          company_name: company,
        }),
      })
      if (!resp.ok) throw new Error('PDF generation failed')
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${company.replace(/\s+/g, '_')}_brief.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e.message)
    } finally {
      setDownloadingPdf(false)
    }
  }

  function loadExample(ex) {
    setCompany(ex.company)
    setContext(ex.context)
    setFounder(ex.founder)
    setBrief('')
    setSources([])
    setError('')
    setStatus('')
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <header style={{
        background: 'var(--navy)',
        padding: '16px 32px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, color: '#fff', fontWeight: 600,
        }}>M</div>
        <span style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>M13 Meeting Prep</span>
        <span style={{ color: 'rgba(255,255,255,0.3)', margin: '0 4px' }}>—</span>
        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>AI-powered briefing generator</span>
      </header>

      <main style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '380px 1fr',
        gap: '0',
        maxHeight: 'calc(100vh - 61px)'
      }}>

        {/* Left panel - Input */}
        <aside style={{
          background: 'var(--surface)',
          borderRight: '1px solid var(--border)',
          padding: '28px 24px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        }}>
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: 'var(--navy)' }}>
              Meeting details
            </h2>

            <label style={labelStyle}>Company name *</label>
            <input
              style={inputStyle}
              value={company}
              onChange={e => setCompany(e.target.value)}
              placeholder="e.g. Cursor, Perplexity AI"
              disabled={loading}
            />

            <label style={labelStyle}>Meeting context *</label>
            <textarea
              style={{ ...inputStyle, height: 72, resize: 'vertical' }}
              value={context}
              onChange={e => setContext(e.target.value)}
              placeholder="e.g. Series A intro call with co-founder"
              disabled={loading}
            />

            <label style={labelStyle}>Founder name <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span></label>
            <input
              style={inputStyle}
              value={founder}
              onChange={e => setFounder(e.target.value)}
              placeholder="e.g. Aman Sanger"
              disabled={loading}
            />

            <button
              onClick={handleGenerate}
              disabled={loading || !company.trim() || !context.trim()}
              style={{
                ...btnStyle,
                background: loading || !company.trim() || !context.trim()
                  ? '#c7c5bf' : 'var(--accent)',
                cursor: loading || !company.trim() || !context.trim() ? 'not-allowed' : 'pointer',
                marginTop: 8,
              }}
            >
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                  <Spinner /> Generating...
                </span>
              ) : 'Generate brief'}
            </button>

            {status && (
              <div style={{
                marginTop: 10,
                fontSize: 12,
                color: 'var(--muted)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}>
                <Spinner size={12} /> {status}
              </div>
            )}

            {error && (
              <div style={{
                marginTop: 10, padding: '10px 12px',
                background: '#fef2f2', border: '1px solid #fca5a5',
                borderRadius: 8, fontSize: 12, color: '#dc2626',
              }}>
                {error}
              </div>
            )}
          </div>

          {/* Examples */}
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Try an example
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {EXAMPLE_COMPANIES.map((ex, i) => (
                <button
                  key={i}
                  onClick={() => loadExample(ex)}
                  disabled={loading}
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: '10px 12px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = '#94a3b8'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{ex.company}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{ex.context}</div>
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Right panel - Output */}
        <section style={{
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>

          {/* Output toolbar */}
          {brief && (
            <div style={{
              padding: '12px 24px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--surface)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>
                {company} — Meeting Brief
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => navigator.clipboard.writeText(brief)}
                  style={secondaryBtnStyle}
                >
                  Copy markdown
                </button>
                <button
                  onClick={handleDownloadPdf}
                  disabled={downloadingPdf}
                  style={{
                    ...secondaryBtnStyle,
                    background: 'var(--navy)',
                    color: '#fff',
                    border: 'none',
                  }}
                >
                  {downloadingPdf ? 'Generating PDF...' : 'Download PDF'}
                </button>
              </div>
            </div>
          )}

          {/* Brief content */}
          <div
            ref={briefRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: brief ? '32px 40px' : '0',
              background: '#fafaf8',
            }}
          >
            {!brief && !loading && (
              <EmptyState />
            )}

            {brief && (
              <div style={{ maxWidth: 720, margin: '0 auto' }}>
                <div className="md-content">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {brief}
                  </ReactMarkdown>
                </div>
                {loading && (
                  <span style={{
                    display: 'inline-block',
                    width: 8, height: 16,
                    background: 'var(--accent)',
                    borderRadius: 2,
                    animation: 'blink 1s step-end infinite',
                    verticalAlign: 'text-bottom',
                    marginLeft: 2,
                    marginTop: -4,
                  }} />
                )}

                {/* Sources panel */}
                {sources.length > 0 && !loading && (
                  <div style={{
                    marginTop: 32,
                    borderTop: '1px solid var(--border)',
                    paddingTop: 20,
                  }}>
                    <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
                      Sources ({sources.length})
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {sources.map((src, i) => (
                        <a
                          key={i}
                          href={src.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'flex',
                            gap: 10,
                            padding: '10px 12px',
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            borderRadius: 8,
                            textDecoration: 'none',
                            transition: 'border-color 0.15s',
                          }}
                          onMouseEnter={e => e.currentTarget.style.borderColor = '#94a3b8'}
                          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                        >
                          <span style={{
                            minWidth: 20, height: 20,
                            background: '#e8e6e0',
                            borderRadius: 4,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 10, fontWeight: 600, color: 'var(--muted)',
                            marginTop: 1,
                          }}>{i + 1}</span>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)', marginBottom: 2 }}>
                              {src.title}
                            </div>
                            {src.snippet && (
                              <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
                                {src.snippet.slice(0, 140)}...
                              </div>
                            )}
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </main>

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes spin { to { transform: rotate(360deg); } }
        .md-content h1 { font-size: 20px; font-weight: 600; margin: 0 0 16px; }
        .md-content h2 { font-size: 15px; font-weight: 600; margin: 24px 0 8px; color: var(--navy);
          border-bottom: 1px solid var(--border); padding-bottom: 6px; }
        .md-content h3 { font-size: 13px; font-weight: 600; margin: 14px 0 6px; }
        .md-content p { margin: 0 0 10px; font-size: 14px; line-height: 1.65; color: #2a2a2a; }
        .md-content ul { margin: 0 0 10px; padding-left: 20px; }
        .md-content li { font-size: 14px; line-height: 1.65; color: #2a2a2a; margin-bottom: 4px; }
        .md-content strong { font-weight: 600; color: var(--navy); }
        .md-content em { color: var(--muted); }
        .md-content code { background: #f0eeea; padding: 1px 5px; border-radius: 4px; font-size: 12px; }
      `}</style>
    </div>
  )
}

function EmptyState() {
  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      color: 'var(--muted)',
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: '50%',
        background: '#e8e6e0',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22,
      }}>📋</div>
      <p style={{ fontWeight: 500, fontSize: 15, color: '#444' }}>Your briefing will appear here</p>
      <p style={{ fontSize: 13, maxWidth: 300, textAlign: 'center', lineHeight: 1.5 }}>
        Enter a company name and meeting context to generate an AI-powered brief with live web research, CRM notes, and M13 thesis context.
      </p>
    </div>
  )
}

function Spinner({ size = 14 }) {
  return (
    <span style={{
      display: 'inline-block',
      width: size, height: size,
      border: `2px solid rgba(0,0,0,0.1)`,
      borderTopColor: 'var(--accent)',
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
    }} />
  )
}

const labelStyle = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: '#444',
  marginBottom: 5,
  marginTop: 14,
}

const inputStyle = {
  width: '100%',
  padding: '9px 12px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 13,
  outline: 'none',
  background: '#fafaf8',
  color: '#1a1a1a',
  transition: 'border-color 0.15s',
  fontFamily: 'inherit',
}

const btnStyle = {
  width: '100%',
  padding: '11px 16px',
  borderRadius: 8,
  border: 'none',
  fontSize: 13,
  fontWeight: 600,
  color: '#fff',
  transition: 'background 0.15s',
  fontFamily: 'inherit',
}

const secondaryBtnStyle = {
  padding: '7px 14px',
  borderRadius: 7,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  fontSize: 12,
  fontWeight: 500,
  color: '#444',
  cursor: 'pointer',
  fontFamily: 'inherit',
}


