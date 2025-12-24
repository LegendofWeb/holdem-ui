import { useMemo, useState } from 'react'
import './App.css'

const POSITIONS = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB']
const ACTIONS = ['FOLD', 'CHECK', 'CALL', 'RAISE', 'ALL-IN']
const INITIAL_COMMITTED = { UTG: 0, HJ: 0, CO: 0, BTN: 0, SB: 0.5, BB: 1 }

const fmt = (n) => {
  const x = Number(n)
  if (Number.isNaN(x)) return '0'
  return Number.isInteger(x) ? String(x) : String(x).replace(/\.0+$/, '')
}

function normCard(raw) {
  const s = (raw || '').trim().replace(/\s+/g, '')
  if (!s) return ''
  const lower = s.toLowerCase()
  if (lower.startsWith('10') && lower.length >= 3) return `10${lower[2]}`
  const r = (lower[0] || '').toUpperCase()
  const suit = lower[1] ? lower[1].toLowerCase() : ''
  return `${r}${suit}`
}

function computeGameState(cards) {
  let street = 'PREFLOP'
  const committed = { ...INITIAL_COMMITTED }
  let pot = Object.values(committed).reduce((s, v) => s + v, 0)

  let streetBets = { UTG: 0, HJ: 0, CO: 0, BTN: 0, SB: 0, BB: 0 }
  let toCall = 0
  let lastRaiseTo = 1

  const syncStreetBetsToCommittedPreflop = () => {
    streetBets = { ...committed }
    toCall = lastRaiseTo
  }
  syncStreetBetsToCommittedPreflop()

  for (const c of cards) {
    if (!c) continue

    if (c.type === 'BOARD') {
      const nextStreet = c.street
      if (nextStreet) street = nextStreet
      streetBets = { UTG: 0, HJ: 0, CO: 0, BTN: 0, SB: 0, BB: 0 }
      toCall = 0
      continue
    }

    if (c.type !== 'ACTION') continue
    const pos = c.pos
    const act = c.act
    const size = Number(c.size)

    if (!Object.prototype.hasOwnProperty.call(committed, pos)) continue

    if (street === 'PREFLOP') {
      if (act === 'FOLD' || act === 'CHECK') {
        syncStreetBetsToCommittedPreflop()
        continue
      }

      if (act === 'CALL') {
        const prev = committed[pos]
        const next = Math.max(prev, lastRaiseTo)
        committed[pos] = next
        pot += (next - prev)
        syncStreetBetsToCommittedPreflop()
        continue
      }

      if (act === 'RAISE') {
        if (!Number.isFinite(size) || size <= 0) {
          syncStreetBetsToCommittedPreflop()
          continue
        }
        const prev = committed[pos]
        const next = Math.max(prev, size)
        committed[pos] = next
        pot += (next - prev)
        lastRaiseTo = size
        syncStreetBetsToCommittedPreflop()
        continue
      }

      if (act === 'ALL-IN') {
        if (Number.isFinite(size) && size > 0) {
          const prev = committed[pos]
          const next = Math.max(prev, size)
          committed[pos] = next
          pot += (next - prev)
          lastRaiseTo = size
        } else {
          const prev = committed[pos]
          const next = Math.max(prev, lastRaiseTo)
          committed[pos] = next
          pot += (next - prev)
        }
        syncStreetBetsToCommittedPreflop()
        continue
      }

      syncStreetBetsToCommittedPreflop()
      continue
    }

    // POSTFLOP
    if (act === 'FOLD' || act === 'CHECK') continue

    if (act === 'CALL') {
      const prevStreet = streetBets[pos]
      const nextStreet = Math.max(prevStreet, toCall)
      const delta = nextStreet - prevStreet
      if (delta > 0) {
        streetBets[pos] = nextStreet
        committed[pos] += delta
        pot += delta
      }
      continue
    }

    if (act === 'RAISE') {
      if (!Number.isFinite(size) || size <= 0) continue
      const prevStreet = streetBets[pos]
      const nextStreet = Math.max(prevStreet, size)
      const delta = nextStreet - prevStreet
      if (delta > 0) {
        streetBets[pos] = nextStreet
        committed[pos] += delta
        pot += delta
      }
      toCall = Math.max(toCall, nextStreet)
      continue
    }

    if (act === 'ALL-IN') {
      if (Number.isFinite(size) && size > 0) {
        const prevStreet = streetBets[pos]
        const nextStreet = Math.max(prevStreet, size)
        const delta = nextStreet - prevStreet
        if (delta > 0) {
          streetBets[pos] = nextStreet
          committed[pos] += delta
          pot += delta
        }
        toCall = Math.max(toCall, nextStreet)
      } else {
        const prevStreet = streetBets[pos]
        const nextStreet = Math.max(prevStreet, toCall)
        const delta = nextStreet - prevStreet
        if (delta > 0) {
          streetBets[pos] = nextStreet
          committed[pos] += delta
          pot += delta
        }
      }
      continue
    }
  }

  if (street === 'PREFLOP') {
    streetBets = { ...committed }
    toCall = lastRaiseTo
  }

  return { pot, streetBets, toCall, street }
}

// ✅ cards를 “저장패널용 텍스트 블록”으로 변환
function buildHandLines(cards) {
  const lines = []
  for (const c of cards) {
    if (c.type === 'SETUP') {
      lines.push(c.text)
      continue
    }
    if (c.type === 'BOARD') {
      // BOARD : FLOP/TURN/RIVER는 카드에 이미 text로 들어가 있음
      lines.push(c.text)
      continue
    }
 if (c.type === 'ACTION') {
  lines.push(c.text)   // street prefix 제거
  continue
}

  }
  return lines
}

export default function App() {
  // 1번: 현재 핸드 로그
  const [cards, setCards] = useState([])

  // 7번: 저장된 핸드들
  const [savedHands, setSavedHands] = useState([]) // { id, title, lines[] }

  // 2~3번
  const [selectedPos, setSelectedPos] = useState(null)
  const [selectedAct, setSelectedAct] = useState(null)
  const [sizeInput, setSizeInput] = useState('')

  // 4번
  const [heroPos, setHeroPos] = useState('')
  const [eff, setEff] = useState('')
  const [heroHand, setHeroHand] = useState('')

  // 5번 Board inputs
  const [flop1, setFlop1] = useState('')
  const [flop2, setFlop2] = useState('')
  const [flop3, setFlop3] = useState('')
  const [turn, setTurn] = useState('')
  const [river, setRiver] = useState('')

  const { pot, streetBets, toCall, street } = useMemo(() => computeGameState(cards), [cards])

  const hasAnyLog = useMemo(() => cards.some(c => c.type !== 'SETUP'), [cards])
  const needsSize = selectedAct === 'RAISE' || selectedAct === 'ALL-IN'

  // Setup upsert (항상 맨 앞)
  const upsertSetup = (next) => {
    setCards(prev => {
      const rest = prev.filter(c => c.type !== 'SETUP')
      return [
        {
          id: 'setup',
          type: 'SETUP',
          text: `Setup · Hero ${next.heroPos || '-'} · ${next.heroHand || '--'} · ${next.eff || '-'}bb`,
        },
        ...rest,
      ]
    })
  }

  const onSetup = (field, value) => {
    const next = { heroPos, eff, heroHand, [field]: value }
    if (field === 'heroPos') setHeroPos(value)
    if (field === 'eff') setEff(value)
    if (field === 'heroHand') setHeroHand(value)
    upsertSetup(next)
  }

  // BOARD 선택 = append (스트리트 리셋 트리거)
  const addBoard = (st, valueText) => {
    setCards(prev => [
      ...prev,
      { id: `board-${st}-${Date.now()}`, type: 'BOARD', street: st, text: `${st} : ${valueText}` },
    ])
  }

  // Undo / Clear
  const undo = () => {
    setCards(prev => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1]
      if (last.type === 'SETUP') return prev
      return prev.slice(0, -1)
    })
    setSelectedAct(null)
    setSizeInput('')
  }

  const clear = () => {
    setCards(prev => prev.filter(c => c.type === 'SETUP'))
    setSelectedAct(null)
    setSizeInput('')
  }

  // Action 추가
  const addAction = () => {
    if (!selectedPos || !selectedAct) return

    const pos = selectedPos
    const act = selectedAct
    const st = street

    let text = `${pos} ${act.toLowerCase()}`
    let sizeToStore = ''

    if (st === 'PREFLOP') {
      if (act === 'CHECK') text = `${pos} checks`
      if (act === 'CALL') text = `${pos} calls ${fmt(toCall)}bb`
      if (act === 'RAISE') {
        if (!sizeInput) return
        sizeToStore = sizeInput
        text = `${pos} raises to ${fmt(sizeInput)}bb`
      }
      if (act === 'ALL-IN') {
        if (sizeInput) {
          sizeToStore = sizeInput
          text = `${pos} all-in to ${fmt(sizeInput)}bb`
        } else {
          text = `${pos} all-in (call ${fmt(toCall)}bb)`
        }
      }
    } else {
      if (act === 'CHECK') text = `${pos} checks`
      if (act === 'CALL') text = `${pos} calls ${fmt(toCall)}bb`
      if (act === 'RAISE') {
        if (!sizeInput) return
        sizeToStore = sizeInput
        text = `${pos} bets ${fmt(sizeInput)}bb`
      }
      if (act === 'ALL-IN') {
        if (sizeInput) {
          sizeToStore = sizeInput
          text = `${pos} all-in ${fmt(sizeInput)}bb`
        } else {
          text = `${pos} all-in (call ${fmt(toCall)}bb)`
        }
      }
    }

    setCards(prev => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, type: 'ACTION', street: st, pos, act, size: sizeToStore, text },
    ])

    setSelectedAct(null)
    setSizeInput('')
  }

  // ✅ 핸드종료: 현재 로그를 savedHands에 저장하고, 현재 cards는 Setup만 남기고 초기화
  const endHand = () => {
    const lines = buildHandLines(cards)
    if (lines.length === 0) return

    setSavedHands(prev => {
      const nextNum = prev.length + 1
      return [
        {
          id: `hand-${nextNum}-${Date.now()}`,
          title: `Hand #${nextNum}`,
          lines,
        },
        ...prev, // 최신이 위로
      ]
    })

    // 복사함수
const copyHand = async (hand) => {
  const text = [hand.title, ...hand.lines].join('\n')

  // 1) 최신 API (localhost에서는 보통 OK)
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text)
    return
  }

  // 2) fallback: "반드시 textarea 내용만" 복사하도록 더 강하게
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.top = '-9999px'
  ta.style.left = '-9999px'
  document.body.appendChild(ta)
  ta.focus()
  ta.select()
  ta.setSelectionRange(0, ta.value.length)

  const ok = document.execCommand('copy')
  document.body.removeChild(ta)

  if (!ok) {
    alert('복사에 실패했어. 브라우저가 클립보드를 막았을 수 있어.')
  }
}


    // 현재 핸드는 초기화 (Setup 유지)
    setCards(prev => prev.filter(c => c.type === 'SETUP'))

    // board 입력칸도 초기화(원하면 유지로 바꿀 수 있음)
    setFlop1(''); setFlop2(''); setFlop3('')
    setTurn(''); setRiver('')

    // 액션 입력도 초기화
    setSelectedAct(null)
    setSizeInput('')
    setSelectedPos(null)
  }

  return (
    <div className="app">
      {/* 1번: History strip */}
      <div className="panel strip">
        <div className="stripControls">
          <button className="btn" onClick={undo} disabled={cards.length === 0 || (cards.length === 1 && cards[0].type === 'SETUP')}>되돌리기</button>
          <button className="btn danger" onClick={clear} disabled={!hasAnyLog}>초기화</button>

          {/* ✅ 핸드종료 버튼 */}
          <button className="btnPrimarySmall" onClick={endHand} disabled={cards.length === 0}>
            핸드종료
          </button>
        </div>

        <div className="stripCards">
          {cards.length === 0 ? (
            <div className="empty">No actions yet</div>
          ) : (
            cards.map(c => (
              <div
                key={c.id}
                className={`stripCard ${(c.type === 'SETUP' || c.type === 'BOARD') ? 'setup' : ''}`}
              >
                {c.text}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="main">
        {/* 2번: Table */}
        <div className="panel tablePanel">
          <div className="table">
            {POSITIONS.map(p => (
              <button
                key={p}
                className={`seat ${p.toLowerCase()} ${selectedPos === p ? 'active' : ''}`}
                onClick={() => setSelectedPos(p)}
              >
                {p}{heroPos === p ? ' (Hero)' : ''}
              </button>
            ))}
          </div>
        </div>

        <div className="rightCol">
          {/* 6번: Pot + betsize */}
          <div className="panel">
            <div className="panelHead">
              <h3>Pot size</h3>
              <div className="headValue">{fmt(pot)}bb</div>
            </div>

            <div className="rows">
              {POSITIONS.map(p => (
                <div key={p} className="row">
                  <div className="rowLeft">{p}</div>
                  <div className="rowRight">{fmt(streetBets[p])}bb</div>
                </div>
              ))}
            </div>

            <div className="note">
              {street === 'PREFLOP'
                ? 'Preflop: betsize = invested(블라인드/raise-to)'
                : 'Postflop: betsize = this street (BOARD 선택 시 0 리셋)'}
            </div>
          </div>

          {/* 3번 + 4번 */}
          <div className="rowPanels">
            {/* 3번: Action */}
            <div className="panel">
              <div className="panelHead">
                <h3>Action</h3>
                <div className="headValue">{street}</div>
              </div>

              <div className="sub">Position: <b>{selectedPos || '—'}</b></div>

              <div className="grid2">
                {ACTIONS.map(a => (
                  <button
                    key={a}
                    className={`chip ${selectedAct === a ? 'active' : ''}`}
                    onClick={() => setSelectedAct(a)}
                    disabled={!selectedPos}
                  >
                    {a}
                  </button>
                ))}
              </div>

              {needsSize && (
                <input
                  className="input"
                  type="number"
                  placeholder={street === 'PREFLOP' ? 'Raise to (bb)' : 'Bet size (bb)'}
                  value={sizeInput}
                  onChange={e => setSizeInput(e.target.value)}
                />
              )}

              <button
                className="btnPrimary"
                onClick={addAction}
                disabled={!selectedPos || !selectedAct || (selectedAct === 'RAISE' && !sizeInput)}
              >
                Add Action
              </button>
            </div>

            {/* 4번: Setup */}
            <div className="panel">
              <h3>Setup</h3>

              <label className="label">
                Effective Stack (bb)
                <input className="input" type="number" value={eff} onChange={e => onSetup('eff', e.target.value)} />
              </label>

              <label className="label">
                Hero Position
                <select className="input" value={heroPos} onChange={e => onSetup('heroPos', e.target.value)}>
                  <option value="">—</option>
                  {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>

              <label className="label">
                Hero Hand
                <input className="input" type="text" placeholder="AhKh" value={heroHand} onChange={e => onSetup('heroHand', e.target.value)} />
              </label>
            </div>
          </div>

          {/* 5번: Board + 선택 버튼 */}
          <div className="panel">
            <h3>Board</h3>

            <div className="boardSec">
              <div className="boardLabel">Flop</div>
              <div className="cardRow">
                <input className="cardIn" value={flop1} onChange={e => setFlop1(e.target.value)} placeholder="As" />
                <input className="cardIn" value={flop2} onChange={e => setFlop2(e.target.value)} placeholder="Kd" />
                <input className="cardIn" value={flop3} onChange={e => setFlop3(e.target.value)} placeholder="7c" />
              </div>
              <button
                className="btn"
                style={{ marginTop: 10, width: '100%' }}
                onClick={() => {
                  const f1 = normCard(flop1), f2 = normCard(flop2), f3 = normCard(flop3)
                  if (!f1 || !f2 || !f3) return
                  addBoard('FLOP', `${f1}${f2}${f3}`)
                }}
              >
                선택
              </button>
            </div>

            <div className="boardSec">
              <div className="boardLabel">Turn</div>
              <div className="cardRow">
                <input className="cardIn" value={turn} onChange={e => setTurn(e.target.value)} placeholder="Qs" />
              </div>
              <button
                className="btn"
                style={{ marginTop: 10, width: '100%' }}
                onClick={() => {
                  const t = normCard(turn)
                  if (!t) return
                  addBoard('TURN', t)
                }}
              >
                선택
              </button>
            </div>

            <div className="boardSec">
              <div className="boardLabel">River</div>
              <div className="cardRow">
                <input className="cardIn" value={river} onChange={e => setRiver(e.target.value)} placeholder="2h" />
              </div>
              <button
                className="btn"
                style={{ marginTop: 10, width: '100%' }}
                onClick={() => {
                  const r = normCard(river)
                  if (!r) return
                  addBoard('RIVER', r)
                }}
              >
                선택
              </button>
            </div>

            <div className="note">선택 = 새 street 시작(팟 유지, street betsize 0 리셋)</div>
          </div>

          {/* ✅ 7번: 저장패널 */}
<div className="panel savedPanel">
  <div className="panelHead">
    <h3>Saved Hands</h3>
    <div className="headValue">{savedHands.length}</div>
  </div>

  {savedHands.length === 0 ? (
    <div className="empty">No saved hands yet</div>
  ) : (
    <div className="savedList">
      {savedHands.map((h) => (
        <div key={h.id} className="savedHand">
          <div className="savedTitleRow">
            <div className="savedTitle">{h.title}</div>

            <button
              type="button"
              className="copyBtn"
              onClick={() => copyHand(h)}
              title="Copy to clipboard"
            >
              공유
            </button>
          </div>

          <div className="savedLines">
            {h.lines.map((line, idx) => (
              <div key={`${h.id}-line-${idx}`} className="savedLine">
                {line}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )}
</div>


        </div>
      </div>
    </div>
  )
}
