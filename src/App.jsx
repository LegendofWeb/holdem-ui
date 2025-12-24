import { useEffect, useMemo, useState } from 'react'
import './App.css'

const POSITIONS = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB']
const ACTIONS = ['FOLD', 'CHECK', 'CALL', 'RAISE', 'ALL-IN']
const INITIAL_COMMITTED = { UTG: 0, HJ: 0, CO: 0, BTN: 0, SB: 0.5, BB: 1 }

const RANKS = ['2','3','4','5','6','7','8','9','T','J','Q','K','A']
const SUITS = [
  { key: 's', symbol: '♠', color: 'black' },
  { key: 'h', symbol: '♥', color: 'red' },
  { key: 'c', symbol: '♣', color: 'black' },
  { key: 'd', symbol: '♦', color: 'red' },
]
const ALL_CARDS = SUITS.flatMap(s =>
  RANKS.map(r => ({
    code: `${r}${s.key}`,
    rank: r,
    suitKey: s.key,
    suitSymbol: s.symbol,
    color: s.color,
  }))
)

const SUIT_INFO = {
  s: { symbol: '♠', color: 'black' },
  h: { symbol: '♥', color: 'red' },
  c: { symbol: '♣', color: 'black' },
  d: { symbol: '♦', color: 'red' },
}

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

// "AsKd7c" -> ["As","Kd","7c"]
function splitBoardString(s) {
  const str = (s || '').trim()
  if (!str) return []
  // 10 처리(이미 normCard는 10을 잘 넣지만, board concat은 T를 쓰는 편이라 여기선 2글자 기준)
  // 현재 프로젝트는 rank를 'T'로 쓰므로 2글자씩 끊으면 OK
  const out = []
  for (let i = 0; i < str.length; i += 2) out.push(str.slice(i, i + 2))
  return out.filter(x => x.length === 2)
}

function cardMeta(code) {
  const c = (code || '').trim()
  if (!c || c.length < 2) return null
  const rank = c[0].toUpperCase()
  const suit = c[1].toLowerCase()
  const info = SUIT_INFO[suit]
  if (!info) return null
  return { code: `${rank}${suit}`, rank, suit, suitSymbol: info.symbol, color: info.color }
}

function computeGameState(cards) {
  let street = 'PREFLOP'
  const committed = { ...INITIAL_COMMITTED }
  let pot = Object.values(committed).reduce((s, v) => s + v, 0)

  let streetBets = { UTG: 0, HJ: 0, CO: 0, BTN: 0, SB: 0, BB: 0 }
  let toCall = 0
  let lastRaiseTo = 1

  const folded = { UTG: false, HJ: false, CO: false, BTN: false, SB: false, BB: false }
  let actedThisStreet = { UTG: false, HJ: false, CO: false, BTN: false, SB: false, BB: false }

  const syncStreetBetsToCommittedPreflop = () => {
    streetBets = { ...committed }
    toCall = lastRaiseTo
  }
  syncStreetBetsToCommittedPreflop()

  const autoFoldNoActionPlayers = () => {
    for (const p of POSITIONS) {
      if (folded[p]) continue
      if (!actedThisStreet[p]) folded[p] = true
    }
  }

  for (const c of cards) {
    if (!c) continue

    if (c.type === 'BOARD') {
      autoFoldNoActionPlayers()
      if (c.street) street = c.street
      actedThisStreet = { UTG: false, HJ: false, CO: false, BTN: false, SB: false, BB: false }
      streetBets = { UTG: 0, HJ: 0, CO: 0, BTN: 0, SB: 0, BB: 0 }
      toCall = 0
      continue
    }

    if (c.type !== 'ACTION') continue
    const pos = c.pos
    const act = c.act
    const size = Number(c.size)

    if (!Object.prototype.hasOwnProperty.call(committed, pos)) continue
    if (folded[pos]) continue

    actedThisStreet[pos] = true

    if (act === 'FOLD') {
      folded[pos] = true
      if (street === 'PREFLOP') syncStreetBetsToCommittedPreflop()
      continue
    }

    if (street === 'PREFLOP') {
      if (act === 'CHECK') { syncStreetBetsToCommittedPreflop(); continue }

      if (act === 'CALL') {
        const prev = committed[pos]
        const next = Math.max(prev, lastRaiseTo)
        committed[pos] = next
        pot += (next - prev)
        syncStreetBetsToCommittedPreflop()
        continue
      }

      if (act === 'RAISE') {
        if (!Number.isFinite(size) || size <= 0) { syncStreetBetsToCommittedPreflop(); continue }
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
    if (act === 'CHECK') continue

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

  return { pot, toCall, street, folded }
}

/**
 * ✅ 저장패널용: cards(log)를 "구조화된 items"로 변환
 * item 종류:
 * - { kind:'setup', heroPos, eff, hero:[c1,c2] }
 * - { kind:'street', street:'PREFLOP'|'FLOP'|'TURN'|'RIVER' }
 * - { kind:'board', street, cards:[...] }
 * - { kind:'action', text }
 */
function buildSavedItems(cards, { heroPos, eff, hero1, hero2 }) {
  const items = []
  items.push({
    kind: 'setup',
    heroPos: heroPos || '-',
    eff: eff || '-',
    hero: [hero1, hero2].filter(Boolean),
  })

  let currentStreet = 'PREFLOP'
  items.push({ kind: 'street', street: currentStreet })

  for (const c of cards) {
    if (!c) continue
    if (c.type === 'SETUP') continue

    if (c.type === 'BOARD') {
      // street 넘어가면 구분선 먼저
      if (c.street && c.street !== currentStreet) {
        currentStreet = c.street
        items.push({ kind: 'street', street: currentStreet })
      }
      const raw = (c.text || '').split(':')[1] ? (c.text.split(':')[1].trim()) : ''
      const bc = splitBoardString(raw).map(cardMeta).filter(Boolean)
      items.push({ kind: 'board', street: currentStreet, cards: bc })
      continue
    }

    if (c.type === 'ACTION') {
      items.push({ kind: 'action', text: c.text })
    }
  }
  return items
}

function itemsToClipboardText(title, items) {
  const lines = [title]
  for (const it of items) {
    if (it.kind === 'setup') {
      const hh = (it.hero || []).join('')
      lines.push(`Setup · Hero ${it.heroPos} · ${hh || '--'} · ${it.eff}bb`)
    } else if (it.kind === 'street') {
      // 구분선(텍스트용)
      lines.push(`--- ${it.street} ---`)
    } else if (it.kind === 'board') {
      const s = (it.cards || []).map(c => c.code).join('')
      lines.push(`${it.street} : ${s}`)
    } else if (it.kind === 'action') {
      lines.push(it.text)
    }
  }
  return lines.join('\n')
}

function CardPill({ code }) {
  const m = cardMeta(code)
  if (!m) return <span className="cardPill">--</span>
  const rankText = m.rank === 'T' ? '10' : m.rank
  return (
    <span className={`cardPill ${m.color}`}>
      <span className="cardPillRank">{rankText}</span>
      <span className="cardPillSuit">{m.suitSymbol}</span>
    </span>
  )
}

export default function App() {
  const [cards, setCards] = useState([])
  const [savedHands, setSavedHands] = useState([]) // { id, title, items[] }

  const [selectedPos, setSelectedPos] = useState(null)
  const [selectedAct, setSelectedAct] = useState(null)
  const [sizeInput, setSizeInput] = useState('')

  const [heroPos, setHeroPos] = useState('')
  const [eff, setEff] = useState('')
  const [hero1, setHero1] = useState('')
  const [hero2, setHero2] = useState('')

  const [flop1, setFlop1] = useState('')
  const [flop2, setFlop2] = useState('')
  const [flop3, setFlop3] = useState('')
  const [turn, setTurn] = useState('')
  const [river, setRiver] = useState('')

  const [pickTarget, setPickTarget] = useState('')

  const { pot, toCall, street, folded } = useMemo(() => computeGameState(cards), [cards])
  const hasAnyLog = useMemo(() => cards.some(c => c.type !== 'SETUP'), [cards])
  const needsSize = selectedAct === 'RAISE' || selectedAct === 'ALL-IN'

  useEffect(() => {
    if (selectedPos && folded[selectedPos]) {
      setSelectedPos(null)
      setSelectedAct(null)
      setSizeInput('')
    }
  }, [folded, selectedPos])

  const visiblePositions = useMemo(() => POSITIONS.filter(p => !folded[p]), [folded])

  const usedCards = useMemo(() => {
    const vals = [hero1, hero2, flop1, flop2, flop3, turn, river].filter(Boolean)
    return new Set(vals)
  }, [hero1, hero2, flop1, flop2, flop3, turn, river])

  const getSlotValue = (t) => {
    switch (t) {
      case 'H1': return hero1
      case 'H2': return hero2
      case 'F1': return flop1
      case 'F2': return flop2
      case 'F3': return flop3
      case 'T': return turn
      case 'R': return river
      default: return ''
    }
  }
  const setSlotValue = (t, v) => {
    switch (t) {
      case 'H1': setHero1(v); break
      case 'H2': setHero2(v); break
      case 'F1': setFlop1(v); break
      case 'F2': setFlop2(v); break
      case 'F3': setFlop3(v); break
      case 'T': setTurn(v); break
      case 'R': setRiver(v); break
      default: break
    }
  }
  const nextTarget = (t) => {
    const order = ['H1','H2','F1','F2','F3','T','R']
    const idx = order.indexOf(t)
    return idx >= 0 && idx < order.length - 1 ? order[idx + 1] : t
  }
  const onPickCard = (code) => {
    if (!pickTarget) return
    const cur = getSlotValue(pickTarget)
    if (cur === code) return
    if (usedCards.has(code)) return
    setSlotValue(pickTarget, code)
    setPickTarget(nextTarget(pickTarget))
  }

  const copyHand = async (hand) => {
    const text = itemsToClipboardText(hand.title, hand.items)

    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return
    }

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
    if (!ok) alert('복사에 실패했어. 브라우저가 클립보드를 막았을 수 있어.')
  }

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

  const buildHeroHandText = () => {
    if (!hero1 && !hero2) return ''
    return `${hero1 || ''}${hero2 || ''}`
  }

  const onSetup = (field, value) => {
    const next = {
      heroPos,
      eff,
      heroHand: buildHeroHandText(),
      [field]: value,
    }
    if (field === 'heroPos') setHeroPos(value)
    if (field === 'eff') setEff(value)
    upsertSetup(next)
  }

  useEffect(() => {
    upsertSetup({ heroPos, eff, heroHand: buildHeroHandText() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hero1, hero2])

  const addBoard = (st, valueText) => {
    setCards(prev => [
      ...prev,
      { id: `board-${st}-${Date.now()}`, type: 'BOARD', street: st, text: `${st} : ${valueText}` },
    ])
  }

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

  const nextStreetMarker = () => {
    if (street !== 'PREFLOP') return
    addBoard('FLOP', '')
  }

  const addAction = () => {
    if (!selectedPos || !selectedAct) return
    if (folded[selectedPos]) return

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
      if (act === 'FOLD') text = `${pos} folds`
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
      if (act === 'FOLD') text = `${pos} folds`
    }

    setCards(prev => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, type: 'ACTION', street: st, pos, act, size: sizeToStore, text },
    ])

    setSelectedAct(null)
    setSizeInput('')
  }

  const endHand = () => {
    const items = buildSavedItems(cards, { heroPos, eff, hero1, hero2 })
    if (!items || items.length === 0) return

    setSavedHands(prev => {
      const nextNum = prev.length + 1
      return [
        { id: `hand-${nextNum}-${Date.now()}`, title: `Hand #${nextNum}`, items },
        ...prev,
      ]
    })

    setCards(prev => prev.filter(c => c.type === 'SETUP'))

    setFlop1(''); setFlop2(''); setFlop3('')
    setTurn(''); setRiver('')
    setHero1(''); setHero2('')
    setPickTarget('')

    setSelectedAct(null)
    setSizeInput('')
    setSelectedPos(null)
  }

  return (
    <div className="app">
      {/* 1) History strip */}
      <div className="panel strip">
        <div className="stripControls">
          <button className="btn" onClick={undo} disabled={cards.length === 0 || (cards.length === 1 && cards[0].type === 'SETUP')}>
            되돌리기
          </button>
          <button className="btn danger" onClick={clear} disabled={!hasAnyLog}>
            초기화
          </button>
          <button className="btn" onClick={nextStreetMarker} disabled={street !== 'PREFLOP'}>
            다음
          </button>
          <button className="btnPrimarySmall" onClick={endHand} disabled={cards.length === 0}>
            핸드종료
          </button>
        </div>

        <div className="stripCards">
          {cards.length === 0 ? (
            <div className="empty">No actions yet</div>
          ) : (
            cards.map(c => (
              <div key={c.id} className={`stripCard ${(c.type === 'SETUP' || c.type === 'BOARD') ? 'setup' : ''}`}>
                {c.text}
              </div>
            ))
          )}
        </div>
      </div>

      {/* ===== Stage ===== */}
      <div className="stageWrap">
        <div className="stageCols">
          {/* Left */}
          <div className="panel leftCard">
            <div className="leftSection">
              <div className="leftTitle">Table</div>
              <div className="tableShell">
                <div className="table compact">
                  {visiblePositions.map(p => (
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
            </div>

            <div className="leftDivider" />

            <div className="leftSection">
              <div className="leftTitle">Pot</div>
              <div className="potMiniValue">{fmt(pot)}bb</div>
            </div>

            <div className="leftDivider" />

            <div className="leftSection">
              <div className="leftTitle">Board</div>

              <div className="boardRow">
                <div className="boardTag">Flop</div>
                <button type="button" className={`slotIn ${pickTarget==='F1'?'active':''}`} onClick={() => setPickTarget('F1')}>
                  {flop1 || '--'}
                </button>
                <button type="button" className={`slotIn ${pickTarget==='F2'?'active':''}`} onClick={() => setPickTarget('F2')}>
                  {flop2 || '--'}
                </button>
                <button type="button" className={`slotIn ${pickTarget==='F3'?'active':''}`} onClick={() => setPickTarget('F3')}>
                  {flop3 || '--'}
                </button>
                <button
                  className="btn boardBtn"
                  onClick={() => {
                    const f1 = normCard(flop1), f2 = normCard(flop2), f3 = normCard(flop3)
                    if (!f1 || !f2 || !f3) return
                    addBoard('FLOP', `${f1}${f2}${f3}`)
                  }}
                >
                  선택
                </button>
              </div>

              <div className="boardRow">
                <div className="boardTag">Turn</div>
                <button type="button" className={`slotIn ${pickTarget==='T'?'active':''}`} onClick={() => setPickTarget('T')}>
                  {turn || '--'}
                </button>
                <button
                  className="btn boardBtn"
                  onClick={() => {
                    const t = normCard(turn)
                    if (!t) return
                    addBoard('TURN', t)
                  }}
                >
                  선택
                </button>
              </div>

              <div className="boardRow">
                <div className="boardTag">River</div>
                <button type="button" className={`slotIn ${pickTarget==='R'?'active':''}`} onClick={() => setPickTarget('R')}>
                  {river || '--'}
                </button>
                <button
                  className="btn boardBtn"
                  onClick={() => {
                    const r = normCard(river)
                    if (!r) return
                    addBoard('RIVER', r)
                  }}
                >
                  선택
                </button>
              </div>

              <div className="note">슬롯 클릭 → 아래 Card Picker에서 카드 선택</div>
            </div>
          </div>

          {/* Right stack */}
          <div className="rightStack">
            <div className="rightPair">
              {/* Action */}
              <div className="panel rightTall">
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
                      disabled={!selectedPos || (selectedPos && folded[selectedPos])}
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
                    disabled={!selectedPos || (selectedPos && folded[selectedPos])}
                  />
                )}

                <button
                  className="btnPrimary"
                  onClick={addAction}
                  disabled={!selectedPos || !selectedAct || (selectedAct === 'RAISE' && !sizeInput) || (selectedPos && folded[selectedPos])}
                >
                  Add Action
                </button>
              </div>

              {/* Setup */}
              <div className="panel rightTall">
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
                  Hero Hand (slot → pick below)
                  <div className="slotRow">
                    <button type="button" className={`slotIn ${pickTarget==='H1'?'active':''}`} onClick={() => setPickTarget('H1')}>
                      {hero1 || '--'}
                    </button>
                    <button type="button" className={`slotIn ${pickTarget==='H2'?'active':''}`} onClick={() => setPickTarget('H2')}>
                      {hero2 || '--'}
                    </button>
                    <button type="button" className="btn" onClick={() => { setHero1(''); setHero2(''); }}>
                      지우기
                    </button>
                  </div>
                </label>

                <div className="note">중복카드는 선택 불가</div>
              </div>
            </div>

            {/* Card Picker */}
            <div className="panel cardPicker">
              <div className="panelHead">
                <h3>Card Picker</h3>
                <div className="headValue">{pickTarget ? `Now: ${pickTarget}` : 'Click a slot'}</div>
              </div>

              <div className="cardGrid">
                {ALL_CARDS.map((c) => {
                  const disabled = usedCards.has(c.code)
                  return (
                    <button
                      key={c.code}
                      type="button"
                      className={`cardBtn ${c.color}`}
                      title={c.code}
                      disabled={disabled}
                      onClick={() => onPickCard(c.code)}
                    >
                      <span className="cardRank">{c.rank}</span>
                      <span className="cardSuit">{c.suitSymbol}</span>
                    </button>
                  )
                })}
              </div>

              <div className="note">슬롯을 먼저 클릭하고, 여기서 카드를 선택</div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== 7) Saved Hands (시각화 업그레이드) ===== */}
      <div className="panel savedPanel savedFull">
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
                  <button type="button" className="copyBtn" onClick={() => copyHand(h)}>공유</button>
                </div>

                <div className="savedPretty">
                  {h.items.map((it, idx) => {
                    if (it.kind === 'setup') {
                      return (
                        <div key={`${h.id}-it-${idx}`} className="savedSetupRow">
                          <span className="savedBadge">Setup</span>
                          <span className="savedMeta">Hero {it.heroPos}</span>
                          <span className="savedMeta">{it.eff}bb</span>
                          <span className="savedCards">
                            {(it.hero || []).length === 0
                              ? <span className="savedDim">--</span>
                              : (it.hero || []).map((cc) => <CardPill key={`hero-${cc}-${idx}`} code={cc} />)
                            }
                          </span>
                        </div>
                      )
                    }

                    if (it.kind === 'street') {
                      return (
                        <div key={`${h.id}-it-${idx}`} className="streetDivider">
                          <div className="streetLine" />
                          <div className="streetLabel">{it.street}</div>
                          <div className="streetLine" />
                        </div>
                      )
                    }

                    if (it.kind === 'board') {
                      // FLOP: 3장 / TURN, RIVER: 1장(없으면 빈 표시)
                      return (
                        <div key={`${h.id}-it-${idx}`} className="savedBoardRow">
                          <span className="savedBadge">{it.street}</span>
                          <span className="savedCards">
                            {(it.cards || []).length === 0
                              ? <span className="savedDim">--</span>
                              : (it.cards || []).map((cc) => <CardPill key={`${h.id}-${cc.code}-${idx}`} code={cc.code} />)
                            }
                          </span>
                        </div>
                      )
                    }

                    if (it.kind === 'action') {
                      return (
                        <div key={`${h.id}-it-${idx}`} className="savedActionRow">
                          <span className="savedActionDot" />
                          <span className="savedActionText">{it.text}</span>
                        </div>
                      )
                    }

                    return null
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
