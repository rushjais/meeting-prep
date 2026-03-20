import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Benchmark from './Benchmark.jsx'
import ChatPanel from './ChatPanel.jsx'

const API_BASE = import.meta.env.VITE_API_BASE || ''

const EXAMPLE_COMPANIES = [
  { company: 'Cursor', context: 'Series A intro call with co-founder', founder: 'Aman Sanger' },
  { company: 'Perplexity AI', context: 'Follow-up diligence call', founder: 'Aravind Srinivas' },
  { company: 'Codeium', context: 'Initial outreach, seed round exploration', founder: '' },
]

function loadSaved() {
  try { return JSON.parse(localStorage.getItem('m13_briefs') || '[]') } catch { return [] }
}
function persistBriefs(briefs) {
  localStorage.setItem('m13_briefs', JSON.stringify(briefs))
}

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
  const [savedBriefs, setSavedBriefs] = useState(loadSaved)
  const [activeId, setActiveId] = useState(null)
  const [genTime, setGenTime] = useState(null)
  const [tab, setTab] = useState('new')
  const [page, setPage] = useState('brief')
  const [chatOpen, setChatOpen] = useState(false)
  const briefRef = useRef(null)
  const startTimeRef = useRef(null)

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
    setGenTime(null)
    setActiveId(null)
    startTimeRef.current = Date.now()

    let fullBrief = ''
    let briefSources = []

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
            if (data.type === 'status') {
              setStatus(data.text)
            } else if (data.type === 'sources') {
              briefSources = data.sources || []
              setSources(briefSources)
            } else if (data.type === 'content') {
              fullBrief += data.text
              setBrief(fullBrief)
            } else if (data.type === 'done') {
              const elapsed = ((Date.now() - startTimeRef.current) / 1000).toFixed(1)
              setGenTime(elapsed)
              setStatus('')
              setLoading(false)
              const id = Date.now().toString()
              const entry = {
                id, company: company.trim(), context: context.trim(),
                founder: founder.trim(), brief: fullBrief,
                sources: briefSources, generatedAt: new Date().toISOString(),
                genTime: elapsed,
              }
              setSavedBriefs(prev => {
                const updated = [entry, ...prev].slice(0, 20)
                persistBriefs(updated)
                return updated
              })
              setActiveId(id)
            } else if (data.type === 'error') {
              setError(data.text)
              setLoading(false)
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch (e) {
      setError(e.message || 'Something went wrong.')
      setLoading(false)
    }
  }

  function loadSavedBrief(entry) {
    setCompany(entry.company)
    setContext(entry.context)
    setFounder(entry.founder || '')
    setBrief(entry.brief)
    setSources(entry.sources || [])
    setGenTime(entry.genTime || null)
    setActiveId(entry.id)
    setError('')
    setStatus('')
    setTab('new')
  }

  function deleteSaved(id, e) {
    e.stopPropagation()
    setSavedBriefs(prev => {
      const updated = prev.filter(b => b.id !== id)
      persistBriefs(updated)
      return updated
    })
    if (activeId === id) {
      setBrief('')
      setSources([])
      setActiveId(null)
      setGenTime(null)
    }
  }

  function handleNew() {
    setCompany('')
    setContext('')
    setFounder('')
    setBrief('')
    setSources([])
    setError('')
    setStatus('')
    setGenTime(null)
    setActiveId(null)
  }

  async function handleDownloadPdf() {
    if (!brief) return
    setDownloadingPdf(true)
    try {
      const resp = await fetch(`${API_BASE}/brief/pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown_content: brief, company_name: company }),
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
    setGenTime(null)
    setActiveId(null)
    setTab('new')
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <header style={{
        background: 'var(--navy)', padding: '14px 24px',
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
      }}>
        <div style={{
          width: 26, height: 26, borderRadius: '50%',
          background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, color: '#fff', fontWeight: 700,
        }}>M</div>
        <span style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>M13 Meeting Prep</span>
        <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 14 }}>—</span>
        <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>AI-powered briefing generator</span>

        {/* Top-level nav */}
        <div style={{ marginLeft: 24, display: 'flex', gap: 4 }}>
          {[['brief', 'Meeting Prep'], ['benchmark', 'Benchmarking']].map(([key, label]) => (
            <button key={key} onClick={() => setPage(key)} style={{
              padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 500, fontFamily: 'inherit',
              background: page === key ? 'rgba(255,255,255,0.15)' : 'transparent',
              color: page === key ? '#fff' : 'rgba(255,255,255,0.5)',
              transition: 'all 0.15s',
            }}
              onMouseEnter={e => { if (page !== key) e.currentTarget.style.color = 'rgba(255,255,255,0.8)' }}
              onMouseLeave={e => { if (page !== key) e.currentTarget.style.color = 'rgba(255,255,255,0.5)' }}
            >{label}</button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto' }}>
          {savedBriefs.length > 0 && (
            <span style={{
              background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.55)',
              fontSize: 11, padding: '3px 10px', borderRadius: 20,
            }}>
              {savedBriefs.length} saved
            </span>
          )}
        </div>
      </header>

      <main style={{
        flex: 1, display: 'grid',
        gridTemplateColumns: '360px 1fr',
        height: 'calc(100vh - 54px)',
        overflow: 'hidden',
      }}>
        {page === 'benchmark' && (
          <div style={{ gridColumn: '1 / -1', overflow: 'hidden' }}>
            <Benchmark />
          </div>
        )}
        {page === 'brief' && (<>

        {/* Left panel */}
        <aside style={{
          background: 'var(--surface)', borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>

          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            {['new', 'saved'].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                flex: 1, padding: '11px 0', border: 'none', cursor: 'pointer',
                background: tab === t ? 'var(--surface)' : '#f5f4f0',
                borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
                fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
                color: tab === t ? 'var(--accent)' : 'var(--muted)',
                textTransform: 'uppercase', fontFamily: 'inherit', transition: 'all 0.15s',
              }}>
                {t === 'new' ? 'New brief' : `Saved${savedBriefs.length > 0 ? ` (${savedBriefs.length})` : ''}`}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

            {/* NEW TAB */}
            {tab === 'new' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div>
                  <label style={labelStyle}>Company name *</label>
                  <input style={inputStyle} value={company}
                    onChange={e => setCompany(e.target.value)}
                    placeholder="e.g. Cursor, Perplexity AI" disabled={loading} />

                  <label style={labelStyle}>Meeting context *</label>
                  <textarea style={{ ...inputStyle, height: 68, resize: 'vertical' }}
                    value={context} onChange={e => setContext(e.target.value)}
                    placeholder="e.g. Series A intro call with co-founder" disabled={loading} />

                  <label style={labelStyle}>
                    Founder name{' '}
                    <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span>
                  </label>
                  <input style={inputStyle} value={founder}
                    onChange={e => setFounder(e.target.value)}
                    placeholder="e.g. Aman Sanger" disabled={loading} />

                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button onClick={handleGenerate}
                      disabled={loading || !company.trim() || !context.trim()}
                      style={{
                        ...btnStyle, flex: 1,
                        background: loading || !company.trim() || !context.trim()
                          ? '#c7c5bf' : 'var(--accent)',
                        cursor: loading || !company.trim() || !context.trim()
                          ? 'not-allowed' : 'pointer',
                      }}>
                      {loading
                        ? <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                            <Spinner /> Generating...
                          </span>
                        : 'Generate brief'}
                    </button>
                    {(brief || company) && (
                      <button onClick={handleNew} title="Clear and start new" style={{
                        ...btnStyle, width: 40, flex: 'none', padding: 0,
                        background: '#f0eeea', color: '#555', fontSize: 18,
                      }}>+</button>
                    )}
                  </div>

                  {status && (
                    <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Spinner size={11} /> {status}
                    </div>
                  )}
                  {error && (
                    <div style={{
                      marginTop: 10, padding: '10px 12px', borderRadius: 8,
                      background: '#fef2f2', border: '1px solid #fca5a5',
                      fontSize: 12, color: '#dc2626',
                    }}>{error}</div>
                  )}
                </div>

                {/* Examples */}
                <div>
                  <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Try an example
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {EXAMPLE_COMPANIES.map((ex, i) => (
                      <button key={i} onClick={() => loadExample(ex)} disabled={loading} style={{
                        background: 'var(--surface)', border: '1px solid var(--border)',
                        borderRadius: 8, padding: '9px 12px', cursor: 'pointer',
                        textAlign: 'left', fontFamily: 'inherit',
                      }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = '#94a3b8'}
                        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                      >
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)' }}>{ex.company}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{ex.context}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* SAVED TAB */}
            {tab === 'saved' && (
              <div>
                {savedBriefs.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--muted)' }}>
                    <div style={{ fontSize: 28, marginBottom: 10 }}>📋</div>
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>No saved briefs yet</div>
                    <div style={{ fontSize: 12 }}>Generate one and it'll appear here automatically.</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {savedBriefs.map(entry => (
                      <div key={entry.id} onClick={() => loadSavedBrief(entry)} style={{
                        padding: '12px 14px', borderRadius: 8, cursor: 'pointer',
                        border: `1px solid ${activeId === entry.id ? 'var(--accent)' : 'var(--border)'}`,
                        background: activeId === entry.id ? '#eff6ff' : 'var(--surface)',
                        position: 'relative', transition: 'all 0.15s',
                      }}
                        onMouseEnter={e => { if (activeId !== entry.id) e.currentTarget.style.borderColor = '#94a3b8' }}
                        onMouseLeave={e => { if (activeId !== entry.id) e.currentTarget.style.borderColor = 'var(--border)' }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', paddingRight: 22 }}>
                          {entry.company}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, paddingRight: 22 }}>
                          {entry.context}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 5, display: 'flex', gap: 8 }}>
                          <span>{new Date(entry.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                          {entry.genTime && <span>· {entry.genTime}s</span>}
                        </div>
                        <button onClick={(e) => deleteSaved(entry.id, e)} style={{
                          position: 'absolute', top: 10, right: 8,
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: 'var(--muted)', fontSize: 16, padding: '2px 5px',
                          borderRadius: 4, lineHeight: 1, fontFamily: 'inherit',
                        }}
                          onMouseEnter={e => { e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.background = '#fef2f2' }}
                          onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.background = 'none' }}
                          title="Delete">×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* Right panel */}
        <section style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {brief && (
            <div style={{
              padding: '10px 24px', borderBottom: '1px solid var(--border)',
              background: 'var(--surface)', display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>
                  {company} — Meeting Brief
                </span>
                {genTime && !loading && (
                  <span style={{
                    fontSize: 11, color: 'var(--muted)',
                    background: '#f0eeea', padding: '2px 9px', borderRadius: 20,
                  }}>Generated in {genTime}s</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => navigator.clipboard.writeText(brief)} style={secondaryBtnStyle}>
                  Copy markdown
                </button>
                <button onClick={handleDownloadPdf} disabled={downloadingPdf} style={{
                  ...secondaryBtnStyle, background: 'var(--navy)', color: '#fff', border: 'none',
                }}>
                  {downloadingPdf ? 'Generating...' : 'Download PDF'}
                </button>
                <button onClick={() => setChatOpen(v => !v)} style={{
                  ...secondaryBtnStyle,
                  background: chatOpen ? 'var(--accent)' : 'var(--surface)',
                  color: chatOpen ? '#fff' : '#444',
                  border: chatOpen ? 'none' : '1px solid var(--border)',
                }}>
                  {chatOpen ? 'Close chat' : '💬 Ask'}
                </button>
              </div>
            </div>
          )}

          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <div ref={briefRef} style={{
            flex: 1, overflowY: 'auto',
            padding: brief ? '32px 40px' : 0,
            background: '#fafaf8',
          }}>
            {!brief && !loading && <EmptyState />}

            {brief && (
              <div style={{ maxWidth: 720, margin: '0 auto', paddingBottom: 60 }}>
                <div className="md-content">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{brief}</ReactMarkdown>
                </div>
                {loading && (
                  <span style={{
                    display: 'inline-block', width: 8, height: 16,
                    background: 'var(--accent)', borderRadius: 2,
                    animation: 'blink 1s step-end infinite',
                    verticalAlign: 'text-bottom', marginLeft: 2,
                  }} />
                )}

                {sources.length > 0 && !loading && (
                  <div style={{ marginTop: 36, borderTop: '1px solid var(--border)', paddingTop: 20 }}>
                    <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
                      Sources ({sources.length})
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {sources.map((src, i) => (
                        <a key={i} href={src.url} target="_blank" rel="noopener noreferrer" style={{
                          display: 'flex', gap: 10, padding: '10px 12px',
                          background: 'var(--surface)', border: '1px solid var(--border)',
                          borderRadius: 8, textDecoration: 'none', transition: 'border-color 0.15s',
                        }}
                          onMouseEnter={e => e.currentTarget.style.borderColor = '#94a3b8'}
                          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                        >
                          <span style={{
                            minWidth: 20, height: 20, background: '#e8e6e0', borderRadius: 4,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 10, fontWeight: 600, color: 'var(--muted)', marginTop: 1, flexShrink: 0,
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

          <ChatPanel
            context={brief}
            contextType="brief"
            contextLabel={company || ''}
            isOpen={chatOpen}
            onClose={() => setChatOpen(false)}
          />
          </div>
        </section>
        </>)}
      </main>

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes spin { to { transform: rotate(360deg); } }
        .md-content h1 { font-size: 20px; font-weight: 600; margin: 0 0 16px; color: var(--navy); }
        .md-content h2 { font-size: 15px; font-weight: 600; margin: 28px 0 8px; color: var(--navy);
          border-bottom: 1px solid var(--border); padding-bottom: 6px; }
        .md-content h3 { font-size: 13px; font-weight: 600; margin: 14px 0 6px; }
        .md-content p { margin: 0 0 10px; font-size: 14px; line-height: 1.7; color: #2a2a2a; }
        .md-content ul { margin: 0 0 10px; padding-left: 20px; }
        .md-content li { font-size: 14px; line-height: 1.7; color: #2a2a2a; margin-bottom: 4px; }
        .md-content strong { font-weight: 600; color: var(--navy); }
        .md-content em { color: var(--muted); }
        .md-content code { background: #f0eeea; padding: 1px 5px; border-radius: 4px; font-size: 12px; }
        .md-content hr { border: none; border-top: 1px solid var(--border); margin: 20px 0; }
        input:focus, textarea:focus { outline: none; border-color: var(--accent) !important; }
      `}</style>
    </div>
  )
}

function EmptyState() {
  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 12,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: '50%', background: '#e8e6e0',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
      }}>📋</div>
      <p style={{ fontWeight: 500, fontSize: 15, color: '#444' }}>Your briefing will appear here</p>
      <p style={{ fontSize: 13, maxWidth: 300, textAlign: 'center', lineHeight: 1.6, color: 'var(--muted)' }}>
        Enter a company name and meeting context, then hit Generate brief.
      </p>
    </div>
  )
}

function Spinner({ size = 14 }) {
  return (
    <span style={{
      display: 'inline-block', width: size, height: size,
      border: '2px solid rgba(0,0,0,0.1)', borderTopColor: 'var(--accent)',
      borderRadius: '50%', animation: 'spin 0.7s linear infinite',
    }} />
  )
}

const labelStyle = {
  display: 'block', fontSize: 12, fontWeight: 600,
  color: '#444', marginBottom: 5, marginTop: 14,
}
const inputStyle = {
  width: '100%', padding: '9px 12px', border: '1px solid var(--border)',
  borderRadius: 8, fontSize: 13, outline: 'none', background: '#fafaf8',
  color: '#1a1a1a', fontFamily: 'inherit', transition: 'border-color 0.15s',
  boxSizing: 'border-box',
}
const btnStyle = {
  padding: '10px 16px', borderRadius: 8, border: 'none',
  fontSize: 13, fontWeight: 600, color: '#fff',
  transition: 'background 0.15s', fontFamily: 'inherit', cursor: 'pointer',
}
const secondaryBtnStyle = {
  padding: '7px 14px', borderRadius: 7, border: '1px solid var(--border)',
  background: 'var(--surface)', fontSize: 12, fontWeight: 500,
  color: '#444', cursor: 'pointer', fontFamily: 'inherit',
}