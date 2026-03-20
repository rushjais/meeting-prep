import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import ChatPanel from './ChatPanel.jsx'

const STAGES = ['Seed', 'Series A', 'Series B', 'Series C+']
const SECTORS = ['AI', 'Fintech', 'Health', 'Commerce', 'Work', 'Crypto', 'Other']

const EMPTY_COMPANY = () => ({
  id: Date.now() + Math.random(),
  name: '', stage: 'Series A', sector: 'AI',
  arr: '', arr_growth: '', burn: '', runway: '',
  headcount: '', nrr: '', gross_margin: '', notes: '',
})

const DEMO_COMPANIES = [
  { id: 1, name: 'Acme AI', stage: 'Series A', sector: 'AI', arr: '2400', arr_growth: '180', burn: '280', runway: '18', headcount: '22', nrr: '118', gross_margin: '74', notes: 'Enterprise AI workflow automation' },
  { id: 2, name: 'HealthOS', stage: 'Seed', sector: 'Health', arr: '480', arr_growth: '220', burn: '120', runway: '14', headcount: '9', nrr: '105', gross_margin: '68', notes: 'AI-powered clinical documentation' },
  { id: 3, name: 'TradeFlow', stage: 'Series A', sector: 'Fintech', arr: '1800', arr_growth: '95', burn: '340', runway: '12', headcount: '31', nrr: '98', gross_margin: '61', notes: 'B2B payments infrastructure' },
]

function loadSavedBenchmarks() {
  try { return JSON.parse(localStorage.getItem('m13_benchmarks') || '[]') } catch { return [] }
}
function persistBenchmarks(items) {
  localStorage.setItem('m13_benchmarks', JSON.stringify(items))
}
function loadSavedBriefs() {
  try { return JSON.parse(localStorage.getItem('m13_briefs') || '[]') } catch { return [] }
}

// Guess sector from brief tags/context
function guessSector(brief) {
  const text = (brief.context + ' ' + brief.brief).toLowerCase()
  if (text.includes('fintech') || text.includes('payment') || text.includes('finance')) return 'Fintech'
  if (text.includes('health') || text.includes('medical') || text.includes('clinical')) return 'Health'
  if (text.includes('commerce') || text.includes('ecommerce') || text.includes('retail')) return 'Commerce'
  if (text.includes('crypto') || text.includes('blockchain') || text.includes('web3')) return 'Crypto'
  if (text.includes('work') || text.includes('hr') || text.includes('talent')) return 'Work'
  return 'AI'
}

function guessStage(brief) {
  const text = (brief.context + ' ' + brief.brief).toLowerCase()
  if (text.includes('series b')) return 'Series B'
  if (text.includes('series a')) return 'Series A'
  if (text.includes('seed')) return 'Seed'
  return 'Series A'
}

export default function Benchmark() {
  const [companies, setCompanies] = useState([EMPTY_COMPANY(), EMPTY_COMPANY()])
  const [analysis, setAnalysis] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [genTime, setGenTime] = useState(null)
  const [savedBenchmarks, setSavedBenchmarks] = useState(loadSavedBenchmarks)
  const [activeId, setActiveId] = useState(null)
  const [tab, setTab] = useState('new') // 'new' | 'saved'
  const [showImport, setShowImport] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const outputRef = useRef(null)
  const startRef = useRef(null)
  const savedBriefs = loadSavedBriefs()

  useEffect(() => {
    if (outputRef.current && loading) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [analysis, loading])

  function updateCompany(id, field, value) {
    setCompanies(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c))
  }

  function addCompany() {
    setCompanies(prev => [...prev, EMPTY_COMPANY()])
  }

  function removeCompany(id) {
    if (companies.length <= 2) return
    setCompanies(prev => prev.filter(c => c.id !== id))
  }

  function importFromBrief(brief) {
    const newCompany = {
      ...EMPTY_COMPANY(),
      name: brief.company,
      stage: guessStage(brief),
      sector: guessSector(brief),
      notes: brief.context,
    }
    setCompanies(prev => {
      // Replace first empty company or append
      const emptyIdx = prev.findIndex(c => !c.name.trim())
      if (emptyIdx >= 0) {
        const updated = [...prev]
        updated[emptyIdx] = newCompany
        return updated
      }
      return [...prev, newCompany]
    })
    setShowImport(false)
  }

  function loadDemo() {
    setCompanies(DEMO_COMPANIES)
    setAnalysis('')
    setError('')
    setActiveId(null)
    setTab('new')
  }

  function handleNew() {
    setCompanies([EMPTY_COMPANY(), EMPTY_COMPANY()])
    setAnalysis('')
    setError('')
    setGenTime(null)
    setActiveId(null)
    setTab('new')
  }

  function loadSavedBenchmark(entry) {
    setCompanies(entry.companies)
    setAnalysis(entry.analysis)
    setGenTime(entry.genTime || null)
    setActiveId(entry.id)
    setError('')
    setTab('new')
  }

  function deleteBenchmark(id, e) {
    e.stopPropagation()
    setSavedBenchmarks(prev => {
      const updated = prev.filter(b => b.id !== id)
      persistBenchmarks(updated)
      return updated
    })
    if (activeId === id) {
      setAnalysis('')
      setGenTime(null)
      setActiveId(null)
    }
  }

  async function handleBenchmark() {
    const valid = companies.filter(c => c.name.trim())
    if (valid.length < 2) {
      setError('Add at least 2 companies with names to benchmark.')
      return
    }

    setLoading(true)
    setAnalysis('')
    setError('')
    setStatus('Analyzing KPIs...')
    setGenTime(null)
    setActiveId(null)
    startRef.current = Date.now()

    let fullAnalysis = ''

    const payload = valid.map(c => ({
      name: c.name.trim(), stage: c.stage, sector: c.sector,
      arr:          c.arr          ? parseFloat(c.arr)          : null,
      arr_growth:   c.arr_growth   ? parseFloat(c.arr_growth)   : null,
      burn:         c.burn         ? parseFloat(c.burn)         : null,
      runway:       c.runway       ? parseFloat(c.runway)       : null,
      headcount:    c.headcount    ? parseInt(c.headcount)      : null,
      nrr:          c.nrr          ? parseFloat(c.nrr)          : null,
      gross_margin: c.gross_margin ? parseFloat(c.gross_margin) : null,
      notes:        c.notes.trim() || null,
    }))

    try {
      const resp = await fetch('/benchmark/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companies: payload }),
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
            if (data.type === 'status') setStatus(data.text)
            else if (data.type === 'content') {
              fullAnalysis += data.text
              setAnalysis(fullAnalysis)
            } else if (data.type === 'done') {
              const elapsed = ((Date.now() - startRef.current) / 1000).toFixed(1)
              setGenTime(elapsed)
              setStatus('')
              setLoading(false)
              // Auto-save
              const id = Date.now().toString()
              const companyNames = valid.map(c => c.name).join(', ')
              const entry = {
                id, companies, analysis: fullAnalysis,
                label: companyNames, generatedAt: new Date().toISOString(),
                genTime: elapsed,
              }
              setSavedBenchmarks(prev => {
                const updated = [entry, ...prev].slice(0, 10)
                persistBenchmarks(updated)
                return updated
              })
              setActiveId(id)
            } else if (data.type === 'error') {
              setError(data.text)
              setLoading(false)
            }
          } catch { /* skip */ }
        }
      }
    } catch (e) {
      setError(e.message || 'Something went wrong.')
      setLoading(false)
    }
  }

  const validCount = companies.filter(c => c.name.trim()).length
  const companyLabel = companies.filter(c => c.name.trim()).map(c => c.name).join(', ') || 'Benchmark'

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* Left: inputs */}
      <div style={{
        width: 400, flexShrink: 0, borderRight: '1px solid var(--border)',
        background: 'var(--surface)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
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
              {t === 'new' ? 'Configure' : `Saved${savedBenchmarks.length > 0 ? ` (${savedBenchmarks.length})` : ''}`}
            </button>
          ))}
        </div>

        {/* NEW TAB */}
        {tab === 'new' && (
          <>
            {/* Toolbar */}
            <div style={{
              padding: '10px 14px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
            }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)', flex: 1 }}>
                {validCount} {validCount === 1 ? 'company' : 'companies'}
              </span>
              {/* Import from briefs */}
              {savedBriefs.length > 0 && (
                <div style={{ position: 'relative' }}>
                  <button onClick={() => setShowImport(v => !v)} style={{
                    fontSize: 11, padding: '5px 10px', borderRadius: 6,
                    border: '1px solid var(--border)', background: showImport ? '#eff6ff' : '#f5f4f0',
                    cursor: 'pointer', color: showImport ? 'var(--accent)' : 'var(--muted)',
                    fontFamily: 'inherit', fontWeight: 500, whiteSpace: 'nowrap',
                  }}>↓ Import brief</button>

                  {showImport && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, zIndex: 100,
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                      minWidth: 220, marginTop: 4, overflow: 'hidden',
                    }}>
                      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
                        FROM SAVED BRIEFS
                      </div>
                      {savedBriefs.slice(0, 8).map(brief => (
                        <button key={brief.id} onClick={() => importFromBrief(brief)} style={{
                          width: '100%', textAlign: 'left', padding: '9px 12px',
                          border: 'none', background: 'transparent', cursor: 'pointer',
                          fontFamily: 'inherit', borderBottom: '1px solid var(--border)',
                          transition: 'background 0.1s',
                        }}
                          onMouseEnter={e => e.currentTarget.style.background = '#f5f4f0'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)' }}>{brief.company}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{brief.context}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <button onClick={loadDemo} style={{
                fontSize: 11, padding: '5px 10px', borderRadius: 6,
                border: '1px solid var(--border)', background: '#f5f4f0',
                cursor: 'pointer', color: 'var(--muted)', fontFamily: 'inherit', fontWeight: 500,
              }}>Demo</button>
              {(analysis || companies.some(c => c.name)) && (
                <button onClick={handleNew} style={{
                  fontSize: 11, padding: '5px 10px', borderRadius: 6,
                  border: '1px solid var(--border)', background: '#f5f4f0',
                  cursor: 'pointer', color: 'var(--muted)', fontFamily: 'inherit', fontWeight: 500,
                }}>Clear</button>
              )}
            </div>

            {/* Company cards */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {companies.map((c, idx) => (
                <CompanyCard
                  key={c.id} company={c} index={idx}
                  onChange={(field, val) => updateCompany(c.id, field, val)}
                  onRemove={() => removeCompany(c.id)}
                  canRemove={companies.length > 2}
                />
              ))}
              <button onClick={addCompany} style={{
                padding: '10px', border: '1px dashed var(--border)', borderRadius: 10,
                background: 'transparent', cursor: 'pointer', fontSize: 12,
                color: 'var(--muted)', fontFamily: 'inherit', fontWeight: 500,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}
              >
                <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Add company
              </button>
            </div>

            {/* Run button */}
            <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
              <button onClick={handleBenchmark} disabled={loading || validCount < 2} style={{
                width: '100%', padding: '11px', borderRadius: 8, border: 'none',
                fontSize: 13, fontWeight: 600, color: '#fff', fontFamily: 'inherit',
                background: loading || validCount < 2 ? '#c7c5bf' : 'var(--accent)',
                cursor: loading || validCount < 2 ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s',
              }}>
                {loading
                  ? <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                      <Spinner /> {status || 'Analyzing...'}
                    </span>
                  : `Run benchmark (${validCount} companies)`}
              </button>
              {error && (
                <div style={{
                  marginTop: 8, padding: '8px 12px', borderRadius: 8,
                  background: '#fef2f2', border: '1px solid #fca5a5',
                  fontSize: 12, color: '#dc2626',
                }}>{error}</div>
              )}
            </div>
          </>
        )}

        {/* SAVED TAB */}
        {tab === 'saved' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
            {savedBenchmarks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--muted)' }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>📊</div>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>No saved benchmarks</div>
                <div style={{ fontSize: 12 }}>Run a benchmark and it'll appear here.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {savedBenchmarks.map(entry => (
                  <div key={entry.id} onClick={() => loadSavedBenchmark(entry)} style={{
                    padding: '12px 14px', borderRadius: 8, cursor: 'pointer',
                    border: `1px solid ${activeId === entry.id ? 'var(--accent)' : 'var(--border)'}`,
                    background: activeId === entry.id ? '#eff6ff' : 'var(--surface)',
                    position: 'relative', transition: 'all 0.15s',
                  }}
                    onMouseEnter={e => { if (activeId !== entry.id) e.currentTarget.style.borderColor = '#94a3b8' }}
                    onMouseLeave={e => { if (activeId !== entry.id) e.currentTarget.style.borderColor = 'var(--border)' }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)', paddingRight: 22, lineHeight: 1.4 }}>
                      {entry.label}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 5, display: 'flex', gap: 8 }}>
                      <span>{new Date(entry.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      {entry.genTime && <span>· {entry.genTime}s</span>}
                    </div>
                    <button onClick={(e) => deleteBenchmark(entry.id, e)} style={{
                      position: 'absolute', top: 10, right: 8, background: 'none',
                      border: 'none', cursor: 'pointer', color: 'var(--muted)',
                      fontSize: 16, padding: '2px 5px', borderRadius: 4, lineHeight: 1,
                    }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.background = '#fef2f2' }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.background = 'none' }}
                    >×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right: analysis */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fafaf8', minWidth: 0 }}>
        {analysis && (
          <div style={{
            padding: '10px 20px', borderBottom: '1px solid var(--border)',
            background: 'var(--surface)', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>
                Benchmark Analysis
              </span>
              {genTime && !loading && (
                <span style={{ fontSize: 11, color: 'var(--muted)', background: '#f0eeea', padding: '2px 9px', borderRadius: 20 }}>
                  Generated in {genTime}s
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => navigator.clipboard.writeText(analysis)} style={secondaryBtnStyle}>
                Copy markdown
              </button>
              <button onClick={() => setChatOpen(v => !v)} style={{
                ...secondaryBtnStyle,
                background: chatOpen ? 'var(--navy)' : 'var(--surface)',
                color: chatOpen ? '#fff' : '#444',
                border: chatOpen ? 'none' : '1px solid var(--border)',
              }}>
                {chatOpen ? 'Close chat' : '💬 Ask'}
              </button>
            </div>
          </div>
        )}

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <div ref={outputRef} style={{ flex: 1, overflowY: 'auto', padding: analysis ? '28px 36px' : 0 }}>
            {!analysis && !loading && <EmptyState />}
            {analysis && (
              <div style={{ maxWidth: 680, margin: '0 auto', paddingBottom: 60 }}>
                <div className="md-content">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysis}</ReactMarkdown>
                </div>
                {loading && (
                  <span style={{
                    display: 'inline-block', width: 8, height: 16,
                    background: 'var(--accent)', borderRadius: 2,
                    animation: 'blink 1s step-end infinite',
                    verticalAlign: 'text-bottom', marginLeft: 2,
                  }} />
                )}
              </div>
            )}
          </div>

          <ChatPanel
            context={analysis}
            contextType="benchmark"
            contextLabel={companyLabel}
            isOpen={chatOpen}
            onClose={() => setChatOpen(false)}
          />
        </div>
      </div>
    </div>
  )
}

function CompanyCard({ company: c, index, onChange, onRemove, canRemove }) {
  const [expanded, setExpanded] = useState(true)
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: '#fafaf8', overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px',
        borderBottom: expanded ? '1px solid var(--border)' : 'none', background: 'var(--surface)',
      }}>
        <span style={{
          width: 20, height: 20, borderRadius: '50%', background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 700, color: '#fff', flexShrink: 0,
        }}>{index + 1}</span>
        <input value={c.name} onChange={e => onChange('name', e.target.value)}
          placeholder={`Company ${index + 1} name`} style={{
            flex: 1, border: 'none', background: 'transparent', fontSize: 13,
            fontWeight: 600, color: 'var(--navy)', outline: 'none', fontFamily: 'inherit',
          }} />
        <button onClick={() => setExpanded(e => !e)} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--muted)', fontSize: 11, padding: '2px 4px', fontFamily: 'inherit',
        }}>{expanded ? '▲' : '▼'}</button>
        {canRemove && (
          <button onClick={onRemove} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--muted)', fontSize: 16, padding: '2px 4px', lineHeight: 1,
          }}
            onMouseEnter={e => e.currentTarget.style.color = '#dc2626'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}
          >×</button>
        )}
      </div>
      {expanded && (
        <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={labelStyle}>Stage</label>
              <select value={c.stage} onChange={e => onChange('stage', e.target.value)} style={selectStyle}>
                {STAGES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Sector</label>
              <select value={c.sector} onChange={e => onChange('sector', e.target.value)} style={selectStyle}>
                {SECTORS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <KPIInput label="ARR ($K)" value={c.arr} onChange={v => onChange('arr', v)} placeholder="e.g. 1200" />
            <KPIInput label="ARR Growth (YoY %)" value={c.arr_growth} onChange={v => onChange('arr_growth', v)} placeholder="e.g. 150" />
            <KPIInput label="Monthly Burn ($K)" value={c.burn} onChange={v => onChange('burn', v)} placeholder="e.g. 200" />
            <KPIInput label="Runway (months)" value={c.runway} onChange={v => onChange('runway', v)} placeholder="e.g. 18" />
            <KPIInput label="Headcount" value={c.headcount} onChange={v => onChange('headcount', v)} placeholder="e.g. 15" />
            <KPIInput label="NRR (%)" value={c.nrr} onChange={v => onChange('nrr', v)} placeholder="e.g. 115" />
            <KPIInput label="Gross Margin (%)" value={c.gross_margin} onChange={v => onChange('gross_margin', v)} placeholder="e.g. 72" />
          </div>
          <div>
            <label style={labelStyle}>Notes (optional)</label>
            <input value={c.notes} onChange={e => onChange('notes', e.target.value)}
              placeholder="e.g. Enterprise AI for legal ops" style={{ ...inputStyle, fontSize: 11 }} />
          </div>
        </div>
      )}
    </div>
  )
}

function KPIInput({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input type="number" value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} style={inputStyle} />
    </div>
  )
}

function EmptyState() {
  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 12,
    }}>
      <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#e8e6e0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>📊</div>
      <p style={{ fontWeight: 500, fontSize: 15, color: '#444' }}>Add companies to benchmark</p>
      <p style={{ fontSize: 13, maxWidth: 300, textAlign: 'center', lineHeight: 1.6, color: 'var(--muted)' }}>
        Enter KPIs for 2+ companies and hit Run benchmark. Use "↓ Import brief" to pull from saved Meeting Prep companies.
      </p>
    </div>
  )
}

function Spinner({ size = 13 }) {
  return (
    <span style={{
      display: 'inline-block', width: size, height: size,
      border: '2px solid rgba(0,0,0,0.1)', borderTopColor: 'var(--accent)',
      borderRadius: '50%', animation: 'spin 0.7s linear infinite',
    }} />
  )
}

const labelStyle = { display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }
const inputStyle = { width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, outline: 'none', background: '#fff', color: '#1a1a1a', fontFamily: 'inherit', boxSizing: 'border-box' }
const selectStyle = { ...inputStyle, cursor: 'pointer', appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%236b6a65'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center', paddingRight: 24 }
const secondaryBtnStyle = { padding: '7px 14px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 12, fontWeight: 500, color: '#444', cursor: 'pointer', fontFamily: 'inherit' }