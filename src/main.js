import './style.css'
import pkg from '../package.json'

const BASE = import.meta.env.BASE_URL
const STORAGE_KEY = 'biyoushi_quiz_v1'

const EXAMS = [
    { round: 53, label: '第53回（2025年）', count: 55 },
]

let allQuestions = []
let selectedRound = EXAMS[0].round
let quizQueue = []
let currentIdx = 0
let sessionCorrect = 0
let sessionTotal = 0
let answered = false
let questionOrder = 'random'

// ---------- Bootstrap ----------

async function init() {
    document.getElementById('version-label').textContent = `Ver.${pkg.version}`
    buildExamSelect()
    bindEvents()

    const target = parseHash()
    const round = target ? target.round : selectedRound
    showScreen('home')
    await loadExam(round)
    if (target) {
        startSingleQuestion(target.number)
    }
}

function parseHash() {
    const m = location.hash.match(/^#\/(\d+)\/(\d+)$/)
    return m ? { round: parseInt(m[1]), number: parseInt(m[2]) } : null
}

function buildExamSelect() {
    const sel = document.getElementById('exam-select')
    sel.innerHTML = EXAMS.map(e =>
        `<option value="${e.round}">${e.label}</option>`
    ).join('')
    sel.value = selectedRound
}

async function loadExam(round) {
    selectedRound = round
    allQuestions = []
    document.getElementById('home-stats').innerHTML =
        '<span style="color:var(--text-sub);font-size:14px">読み込み中…</span>'
    try {
        const res = await fetch(`${BASE}data/questions-${round}.json`)
        if (!res.ok) throw new Error('HTTP ' + res.status)
        const data = await res.json()
        allQuestions = data.questions
        updateHomeStats()
    } catch {
        document.getElementById('home-stats').innerHTML =
            '<span style="color:var(--wrong);font-size:14px">データ読み込み失敗。<br>ネット接続を確認してください。</span>'
    }
}

function bindEvents() {
    // home
    document.getElementById('exam-select').addEventListener('change', (e) => loadExam(parseInt(e.target.value)))
    document.getElementById('toggle-random').addEventListener('click', () => setOrder('random'))
    document.getElementById('toggle-sequential').addEventListener('click', () => setOrder('sequential'))
    document.getElementById('btn-all').addEventListener('click', () => startQuiz('all'))
    document.getElementById('btn-weak').addEventListener('click', () => startQuiz('weak'))
    document.getElementById('btn-dashboard').addEventListener('click', showDashboard)

    // quiz
    document.getElementById('quiz-back').addEventListener('click', goHome)
    document.getElementById('next-btn').addEventListener('click', nextQuestion)
    document.getElementById('q-choices').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-choice]')
        if (!btn || btn.disabled) return
        selectAnswer(parseInt(btn.dataset.choice))
    })

    // finish
    document.getElementById('finish-btn-all').addEventListener('click', () => startQuiz('all'))
    document.getElementById('finish-btn-weak').addEventListener('click', () => startQuiz('weak'))
    document.getElementById('finish-btn-dashboard').addEventListener('click', showDashboard)

    // dashboard
    document.getElementById('dash-back').addEventListener('click', goHome)
}

// ---------- Storage ----------

function loadStorage() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { answers: {} }
    } catch {
        return { answers: {} }
    }
}

function saveStorage(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

// ---------- Utilities ----------

function parseBold(text) {
    return text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
}

function shuffle(arr) {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]]
    }
    return a
}

function showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'))
    document.getElementById('screen-' + name).classList.add('active')
}

function pct(correct, total) {
    return total > 0 ? Math.round(correct / total * 100) : null
}

// ---------- Home ----------

function updateHomeStats() {
    const storage = loadStorage()
    const records = Object.values(storage.answers)
    const el = document.getElementById('home-stats')

    if (records.length === 0) {
        el.innerHTML = '<span class="stat-caption">まだ回答記録がありません</span>'
        return
    }

    const totalAttempts = records.reduce((s, r) => s + r.attempts, 0)
    const totalCorrect = records.reduce((s, r) => s + r.correct, 0)
    const overall = pct(totalCorrect, totalAttempts)
    const weakCount = records.filter(r => r.lastResult === 'wrong').length

    el.innerHTML = `
        <span class="stat-big">${overall}%</span>
        <span class="stat-caption">総正答率（${totalCorrect} / ${totalAttempts}）</span>
        ${weakCount > 0 ? `<span class="stat-weak">苦手: ${weakCount}問</span>` : ''}
    `
}

function goHome() {
    history.replaceState(null, '', location.pathname)
    showScreen('home')
    updateHomeStats()
}

function setOrder(order) {
    questionOrder = order
    document.getElementById('toggle-random').classList.toggle('active', order === 'random')
    document.getElementById('toggle-sequential').classList.toggle('active', order === 'sequential')
}

// ---------- Quiz ----------

function startSingleQuestion(number) {
    const q = allQuestions.find(q => q.number === number)
    if (!q) {
        alert(`問${number}が見つかりません`)
        goHome()
        return
    }
    quizQueue = [q]
    currentIdx = 0
    sessionCorrect = 0
    sessionTotal = 0
    answered = false
    document.getElementById('quiz-content').style.display = 'block'
    document.getElementById('finish-content').style.display = 'none'
    showScreen('quiz')
    renderQuestion()
}

function startQuiz(mode) {
    if (allQuestions.length === 0) {
        alert('データを読み込み中です。しばらくお待ちください。')
        return
    }

    const storage = loadStorage()
    let pool

    if (mode === 'weak') {
        pool = allQuestions.filter(q => {
            const rec = storage.answers[q.id]
            return rec && rec.lastResult === 'wrong'
        })
        if (pool.length === 0) {
            alert('苦手問題がありません。全問モードで練習しましょう！')
            return
        }
    } else {
        pool = allQuestions
    }

    const ordered = [...pool].sort((a, b) => a.number - b.number)
    quizQueue = questionOrder === 'sequential' ? ordered : shuffle(ordered)
    currentIdx = 0
    sessionCorrect = 0
    sessionTotal = 0
    answered = false

    document.getElementById('quiz-content').style.display = 'block'
    document.getElementById('finish-content').style.display = 'none'
    showScreen('quiz')
    renderQuestion()
}

function renderQuestion() {
    if (currentIdx >= quizQueue.length) {
        renderFinish()
        return
    }

    answered = false
    const q = quizQueue[currentIdx]
    const total = quizQueue.length

    history.replaceState(null, '', `#/${selectedRound}/${q.number}`)
    document.getElementById('progress-label').textContent = `問${q.number}`
    document.getElementById('progress-fill').style.width = `${(currentIdx / total) * 100}%`
    document.getElementById('session-pct').textContent =
        sessionTotal > 0 ? `${pct(sessionCorrect, sessionTotal)}%` : ''

    document.getElementById('q-subject').textContent = q.subject
    document.getElementById('q-text').innerHTML = parseBold(q.question)

    const preambleEl = document.getElementById('q-preamble')
    if (q.preamble && q.preamble.length > 0) {
        preambleEl.innerHTML = q.preamble.map(p => `<p>${parseBold(p)}</p>`).join('')
        preambleEl.style.display = 'block'
    } else {
        preambleEl.innerHTML = ''
        preambleEl.style.display = 'none'
    }

    const imgEl = document.getElementById('q-image')
    if (q.hasImage) {
        const src = q.imagePath || `${BASE}data/img/${q.id}-1.png`
        imgEl.innerHTML = `<img src="${src}" alt="問${q.number}の図" class="q-img">`
        imgEl.style.display = 'block'
    } else {
        imgEl.innerHTML = ''
        imgEl.style.display = 'none'
    }

    document.getElementById('q-choices').innerHTML = q.choices.map((c, i) => `
        <button class="choice-btn" id="c${i + 1}" data-choice="${i + 1}">
            <span class="choice-num">${i + 1}</span>
            <span>${parseBold(c)}</span>
        </button>
    `).join('')

    const banner = document.getElementById('result-banner')
    banner.className = 'result-banner'
    document.getElementById('next-btn').style.display = 'none'

    window.scrollTo(0, 0)
}

function selectAnswer(choice) {
    if (answered) return
    answered = true

    const q = quizQueue[currentIdx]
    const correct = choice === q.answer

    sessionTotal++
    if (correct) sessionCorrect++

    const storage = loadStorage()
    if (!storage.answers[q.id]) {
        storage.answers[q.id] = { attempts: 0, correct: 0, lastResult: null }
    }
    storage.answers[q.id].attempts++
    if (correct) storage.answers[q.id].correct++
    storage.answers[q.id].lastResult = correct ? 'correct' : 'wrong'
    saveStorage(storage)

    for (let i = 1; i <= 4; i++) {
        const btn = document.getElementById('c' + i)
        if (!btn) continue
        btn.disabled = true
        if (i === q.answer) btn.classList.add('correct')
        else if (i === choice && !correct) btn.classList.add('wrong')
    }

    const banner = document.getElementById('result-banner')
    if (correct) {
        banner.className = 'result-banner show correct'
        document.getElementById('result-icon').textContent = '✓'
        document.getElementById('result-msg').textContent = '正解！'
    } else {
        banner.className = 'result-banner show wrong'
        document.getElementById('result-icon').textContent = '✗'
        document.getElementById('result-msg').innerHTML =
            `不正解 — 正解は <strong>${q.answer}</strong>`
    }

    document.getElementById('session-pct').textContent =
        `${pct(sessionCorrect, sessionTotal)}%`
    document.getElementById('next-btn').style.display = 'block'
}

function nextQuestion() {
    currentIdx++
    renderQuestion()
}

function renderFinish() {
    document.getElementById('quiz-content').style.display = 'none'
    document.getElementById('finish-content').style.display = 'block'

    const p = sessionTotal > 0 ? pct(sessionCorrect, sessionTotal) : 0
    document.getElementById('finish-emoji').textContent = p >= 80 ? '🎉' : p >= 60 ? '👍' : '📚'
    document.getElementById('finish-score').textContent = `${p}%`
    document.getElementById('finish-detail').textContent =
        `${sessionCorrect} / ${sessionTotal} 問正解`

    window.scrollTo(0, 0)
}

// ---------- Dashboard ----------

function showDashboard() {
    renderDashboard()
    showScreen('dashboard')
}

function renderDashboard() {
    const storage = loadStorage()
    const answers = storage.answers

    const totalAttempts = allQuestions.reduce((s, q) =>
        s + (answers[q.id] ? answers[q.id].attempts : 0), 0)
    const totalCorrect = allQuestions.reduce((s, q) =>
        s + (answers[q.id] ? answers[q.id].correct : 0), 0)
    const overallPct = pct(totalCorrect, totalAttempts)
    const weakList = allQuestions.filter(q =>
        answers[q.id] && answers[q.id].lastResult === 'wrong')

    const subjects = {}
    allQuestions.forEach(q => {
        if (!subjects[q.subject]) subjects[q.subject] = { attempts: 0, correct: 0 }
        const rec = answers[q.id]
        if (rec) {
            subjects[q.subject].attempts += rec.attempts
            subjects[q.subject].correct += rec.correct
        }
    })

    let html = ''

    html += `
    <div class="dash-section">
        <div class="section-label">総合</div>
        <div class="stat-card">
            <div class="stat-row">
                <span class="stat-label">総正答率</span>
                <span class="stat-value">${overallPct !== null ? overallPct + '%' : '—'}</span>
            </div>
            ${overallPct !== null ? `<div class="acc-bar"><div class="acc-fill" style="width:${overallPct}%"></div></div>` : ''}
            <div style="margin-top:10px;font-size:13px;color:var(--text-sub)">
                ${totalCorrect} / ${totalAttempts} 回答
            </div>
        </div>
        ${weakList.length > 0 ? `
        <button class="btn btn-secondary" id="dash-btn-weak">
            苦手問題モードを起動（${weakList.length}問）
        </button>` : ''}
    </div>`

    html += `
    <div class="dash-section">
        <div class="section-label">科目別正答率</div>
        <div class="stat-card">`
    for (const [subject, stats] of Object.entries(subjects)) {
        const p = pct(stats.correct, stats.attempts)
        html += `
        <div class="sub-item">
            <div class="stat-row">
                <span class="stat-label" style="font-size:13px">${subject}</span>
                <span class="stat-value">${p !== null ? p + '%' : '—'}</span>
            </div>
            ${p !== null ? `<div class="acc-bar"><div class="acc-fill" style="width:${p}%"></div></div>` : ''}
        </div>`
    }
    html += `</div></div>`

    html += `
    <div class="dash-section">
        <div class="section-label">間違えた問題（${weakList.length}問）</div>
        <div class="stat-card">`
    if (weakList.length === 0) {
        html += `<p class="empty-note">苦手問題はありません 🎉</p>`
    } else {
        weakList.forEach(q => {
            html += `
            <div class="wrong-item">
                <div class="wrong-meta">問${q.number}｜${q.subject}</div>
                <div>${parseBold(q.question)}</div>
            </div>`
        })
    }
    html += `</div></div>`

    document.getElementById('dash-body').innerHTML = html

    // bind dashboard weak button (dynamically rendered)
    const dashWeak = document.getElementById('dash-btn-weak')
    if (dashWeak) dashWeak.addEventListener('click', () => startQuiz('weak'))
}

// ---------- Start ----------
init()
