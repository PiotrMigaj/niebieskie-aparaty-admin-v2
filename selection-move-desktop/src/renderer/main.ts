import type { MoveEntry, MoveSummary, SelectionView } from '../preload/index'

type ScreenId = 'creds-screen' | 'list-screen' | 'folder-screen' | 'progress-screen' | 'summary-screen'

const screens: ScreenId[] = ['creds-screen', 'list-screen', 'folder-screen', 'progress-screen', 'summary-screen']

function show(id: ScreenId): void {
  for (const s of screens) {
    const el = document.getElementById(s)
    if (el) el.hidden = s !== id
  }
}

function $(id: string): HTMLElement {
  const el = document.getElementById(id)
  if (!el) throw new Error(`Missing element #${id}`)
  return el
}

const state: {
  selections: SelectionView[]
  filter: string
  chosenId: string | null
  folder: string | null
} = {
  selections: [],
  filter: '',
  chosenId: null,
  folder: null,
}

function chosenSelection(): SelectionView | null {
  return state.selections.find(s => s.selectionId === state.chosenId) ?? null
}

function formatDate(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;',
  }[ch]!))
}

/* ---------- Credentials screen ---------- */

const credsForm = $('creds-form') as HTMLFormElement
const credsError = $('creds-error')
const credsCancelBtn = $('creds-cancel-btn') as HTMLButtonElement

credsForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  credsError.hidden = true
  const fd = new FormData(credsForm)
  try {
    await window.api.setCreds({
      accessKeyId: String(fd.get('accessKeyId')).trim(),
      secretAccessKey: String(fd.get('secretAccessKey')).trim(),
      region: String(fd.get('region')).trim(),
      tableName: String(fd.get('tableName')).trim(),
    })
    credsForm.reset()
    ;(credsForm.elements.namedItem('region') as HTMLInputElement).value = 'eu-central-1'
    ;(credsForm.elements.namedItem('tableName') as HTMLInputElement).value = 'niebieskie-aparaty-prod'
    await afterCredsReady()
  }
  catch (err) {
    credsError.textContent = (err as Error).message
    credsError.hidden = false
  }
})

credsCancelBtn.addEventListener('click', () => {
  show('list-screen')
})

$('reset-creds-btn').addEventListener('click', async () => {
  await window.api.clearCreds()
  credsCancelBtn.hidden = state.selections.length === 0
  show('creds-screen')
  updateCredsMeta(null)
})

function updateCredsMeta(status: { region: string, tableName: string } | null): void {
  const meta = $('creds-meta')
  const resetBtn = $('reset-creds-btn')
  if (status) {
    meta.textContent = `${status.region} · ${status.tableName}`
    resetBtn.hidden = false
  }
  else {
    meta.textContent = ''
    resetBtn.hidden = true
  }
}

async function afterCredsReady(): Promise<void> {
  const status = await window.api.getCredsStatus()
  updateCredsMeta(status)
  show('list-screen')
  await loadSelections()
}

/* ---------- Selection list ---------- */

const tbody = $('selections-tbody')
const listStatus = $('list-status')
const continueBtn = $('continue-btn') as HTMLButtonElement
const searchInput = $('search-input') as HTMLInputElement

searchInput.addEventListener('input', () => {
  state.filter = searchInput.value.toLowerCase().trim()
  renderTable()
})

$('reload-btn').addEventListener('click', loadSelections)

continueBtn.addEventListener('click', () => {
  const sel = chosenSelection()
  if (!sel) return
  $('selected-title').textContent = sel.eventTitle || sel.eventId
  $('selected-user').textContent = sel.username
  $('selected-count').textContent = String(sel.selectedImages.length)
  $('selected-folder').textContent = '— not selected —'
  ;($('selected-folder')).classList.add('muted')
  state.folder = null
  ;($('start-move-btn') as HTMLButtonElement).disabled = true
  show('folder-screen')
})

async function loadSelections(): Promise<void> {
  listStatus.textContent = 'Loading…'
  tbody.innerHTML = ''
  continueBtn.disabled = true
  state.chosenId = null
  try {
    state.selections = await window.api.listSelections()
    listStatus.textContent = `${state.selections.length} selections · ${state.selections.filter(s => s.blocked).length} eligible`
    renderTable()
  }
  catch (err) {
    listStatus.textContent = `Error: ${(err as Error).message}`
  }
}

function renderTable(): void {
  const rows: string[] = []
  const filter = state.filter
  for (const s of state.selections) {
    if (filter && !`${s.eventTitle} ${s.username}`.toLowerCase().includes(filter)) continue
    const eligible = s.blocked
    const checked = state.chosenId === s.selectionId
    const cls = eligible
      ? (checked ? 'eligible selected' : 'eligible')
      : 'ineligible'
    const badge = s.blocked
      ? '<span class="badge badge-solid">Blocked</span>'
      : '<span class="badge">Open</span>'
    const safeId = escapeHtml(s.selectionId)
    rows.push(`
      <tr class="${cls}" data-id="${safeId}" title="${eligible ? '' : 'Locked — finalize the selection in the admin first'}">
        <td class="col-pick">
          <input type="radio" name="pick" class="pick-radio"
            data-id="${safeId}"
            ${eligible ? '' : 'disabled'}
            ${checked ? 'checked' : ''} />
        </td>
        <td><div class="event-title">${escapeHtml(s.eventTitle || s.eventId)}</div></td>
        <td><div class="user-cell">${escapeHtml(s.username)}</div></td>
        <td>${s.selectedNumberOfPhotos} / ${s.maxNumberOfPhotos}</td>
        <td>${badge}</td>
        <td>${escapeHtml(formatDate(s.createdAt))}</td>
      </tr>
    `)
  }
  tbody.innerHTML = rows.join('')

  tbody.querySelectorAll<HTMLTableRowElement>('tr.eligible').forEach((tr) => {
    tr.addEventListener('click', () => {
      const id = tr.dataset.id ?? null
      state.chosenId = id
      continueBtn.disabled = !id
      renderTable()
    })
  })
}

/* ---------- Folder screen ---------- */

$('back-to-list-btn').addEventListener('click', () => show('list-screen'))

$('pick-folder-btn').addEventListener('click', async () => {
  const folder = await window.api.pickFolder()
  if (!folder) return
  state.folder = folder
  const el = $('selected-folder')
  el.textContent = folder
  el.classList.remove('muted')
  ;($('start-move-btn') as HTMLButtonElement).disabled = false
})

$('start-move-btn').addEventListener('click', async () => {
  const sel = chosenSelection()
  if (!sel || !state.folder) return
  show('progress-screen')
  resetProgress(sel.selectedImages.length)
  const stopListening = window.api.onProgress(updateProgress)
  try {
    const summary = await window.api.startMove(state.folder, sel.selectedImages)
    renderSummary(summary)
    show('summary-screen')
  }
  catch (err) {
    alert(`Move failed: ${(err as Error).message}`)
    show('folder-screen')
  }
  finally {
    stopListening()
  }
})

/* ---------- Progress ---------- */

const progressBar = $('progress-bar')
const progressCounts = $('progress-counts')
const progressCurrent = $('progress-current')

function resetProgress(total: number): void {
  progressBar.style.width = '0%'
  progressCounts.textContent = `0 / ${total}`
  progressCurrent.textContent = ''
}

function updateProgress(e: { done: number, total: number, currentFilename: string }): void {
  const pct = e.total === 0 ? 100 : Math.round((e.done / e.total) * 100)
  progressBar.style.width = `${pct}%`
  progressCounts.textContent = `${e.done} / ${e.total}`
  progressCurrent.textContent = e.currentFilename
}

/* ---------- Summary ---------- */

function renderSummary(summary: MoveSummary): void {
  $('stat-moved').textContent = String(summary.moved)
  $('stat-missing').textContent = String(summary.missing)
  $('stat-existed').textContent = String(summary.already_existed)
  $('stat-errored').textContent = String(summary.errored)
  $('summary-destination').textContent = `Destination: ${summary.destination}`

  const details = $('summary-details')
  details.innerHTML = ''
  const groups: Array<[string, MoveEntry['outcome']]> = [
    ['Missing files', 'missing'],
    ['Already existed', 'already_existed'],
    ['Errors', 'errored'],
  ]
  for (const [label, outcome] of groups) {
    const entries = summary.entries.filter(e => e.outcome === outcome)
    if (entries.length === 0) continue
    const items = entries.map((e) => {
      const txt = e.error ? `${e.imageName} — ${e.error}` : e.imageName
      const cls = outcome === 'errored' ? ' class="error-line"' : ''
      return `<li${cls}>${escapeHtml(txt)}</li>`
    }).join('')
    const block = document.createElement('details')
    block.innerHTML = `<summary>${label} (${entries.length})</summary><ul>${items}</ul>`
    details.appendChild(block)
  }
}

$('done-btn').addEventListener('click', async () => {
  state.folder = null
  state.chosenId = null
  show('list-screen')
  await loadSelections()
})

/* ---------- Boot ---------- */

void (async () => {
  const status = await window.api.getCredsStatus()
  if (status) {
    updateCredsMeta(status)
    show('list-screen')
    await loadSelections()
  }
  else {
    credsCancelBtn.hidden = true
    show('creds-screen')
  }
})()
