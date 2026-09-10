// Shared across all pages. Each device remembers its own last-picked meet
// (localStorage), since different devices might reasonably be looking at
// different competitions (e.g. someone checking last month's results while
// today's meet is running on the Tower).

function getMeetId(){ return localStorage.getItem('paddleTimerMeetId') || ''; }
function setMeetId(id){ localStorage.setItem('paddleTimerMeetId', id); }

// Day selection — persisted PER MEET (different meets have different day
// counts) so picking a day on one page carries over to every other page,
// same pattern as the meet picker itself.
function getSelectedDay(meetId){
  const v = localStorage.getItem('paddleTimerDay_' + (meetId || getMeetId()));
  return v ? Number(v) : null;
}
function setSelectedDay(day, meetId){
  localStorage.setItem('paddleTimerDay_' + (meetId || getMeetId()), day);
}

// Renders a day dropdown into containerId if the current meet has more
// than 1 day (hides itself otherwise). Returns the selected day number
// (or null if this meet is single-day / no meet picked). Changing it
// reloads the page — every page reads getSelectedDay() on load and
// filters its own data by it, so the choice is consistent everywhere.
async function initDayBar(containerId){
  const el = document.getElementById(containerId);
  if(!el) return null;
  const meetId = getMeetId();
  if(!meetId){ el.innerHTML = ''; return null; }
  let meet;
  try {
    const meets = await (await fetch('/api/meets')).json();
    meet = meets.find(m => m.id === meetId);
  } catch (err) { el.innerHTML = ''; return null; }
  const numDays = (meet && meet.numDays) || 1;
  if(numDays <= 1){ el.innerHTML = ''; return null; }
  let day = getSelectedDay(meetId);
  if(!day || day > numDays) day = 1;
  el.innerHTML = `<label style="font-size:13px;color:var(--gray);margin-right:6px">Day:</label><select id="dayBarSelect">${Array.from({length:numDays},(_,i)=>i+1).map(d=>`<option value="${d}" ${d===day?'selected':''}>Day ${d}</option>`).join('')}</select>`;
  document.getElementById('dayBarSelect').onchange = (e) => {
    setSelectedDay(Number(e.target.value), meetId);
    location.reload();
  };
  return day;
}

// Reusable confirm dialog — NOT window.confirm(). Native confirm()/alert()
// can get silently auto-suppressed by the browser after repeated use on a
// page ("Prevent this page from creating additional dialogs"), which
// makes any button relying on it look completely dead with no error.
// This can't be suppressed that way. Resolves true/false.
function customConfirm(message){
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(11,37,64,0.55);display:flex;align-items:center;justify-content:center;z-index:9999;';
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:10px;padding:22px;max-width:360px;width:90%;box-shadow:0 10px 40px rgba(0,0,0,0.3);font-family:inherit">
        <p style="margin:0 0 18px;color:#0B2540;line-height:1.4">${message}</p>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button id="confirmDialogCancel" style="padding:8px 14px;border-radius:6px;border:1px solid #D8DCE0;background:#fff;cursor:pointer;font-size:14px">Cancel</button>
          <button id="confirmDialogOk" style="padding:8px 14px;border-radius:6px;border:none;background:#C93B3B;color:#fff;cursor:pointer;font-weight:600;font-size:14px">Confirm</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    document.getElementById('confirmDialogOk').onclick = () => { document.body.removeChild(overlay); resolve(true); };
    document.getElementById('confirmDialogCancel').onclick = () => { document.body.removeChild(overlay); resolve(false); };
  });
}

// Small reusable dropdown dialog — window.prompt() can't show a <select>,
// so this builds a minimal modal instead. Resolves to the chosen number,
// or null if cancelled.
function laneCountDialog(currentValue){
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(11,37,64,0.55);display:flex;align-items:center;justify-content:center;z-index:9999;';
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:10px;padding:22px;max-width:320px;width:90%;box-shadow:0 10px 40px rgba(0,0,0,0.3);font-family:inherit">
        <p style="margin:0 0 12px;font-weight:600;color:#0B2540">How many lanes does this venue have?</p>
        <select id="laneDialogSelect" style="width:100%;padding:10px;font-size:15px;border-radius:6px;border:1px solid #D8DCE0;margin-bottom:16px">
          ${[6,7,8,9,10].map(n => `<option value="${n}" ${n===currentValue?'selected':''}>${n} lanes${n===9?' (ICF standard)':''}</option>`).join('')}
        </select>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button id="laneDialogCancel" style="padding:8px 14px;border-radius:6px;border:1px solid #D8DCE0;background:#fff;cursor:pointer;font-size:14px">Cancel</button>
          <button id="laneDialogOk" style="padding:8px 14px;border-radius:6px;border:none;background:#0B2540;color:#fff;cursor:pointer;font-weight:600;font-size:14px">OK</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    document.getElementById('laneDialogOk').onclick = () => {
      const val = Number(document.getElementById('laneDialogSelect').value);
      document.body.removeChild(overlay);
      resolve(val);
    };
    document.getElementById('laneDialogCancel').onclick = () => {
      document.body.removeChild(overlay);
      resolve(null);
    };
  });
}

// Combined venue-settings dialog for creating a new meet: lane count,
// number of days, and race type. Race type is currently locked to
// Sprints — this app only knows ICF sprint rules right now — but the
// selector is here so the other disciplines are visible as a roadmap and
// slot straight in later without reshaping this dialog again.
//
// Minimum rest between rounds (heat->semi->final) used to be a setting
// here too — it's gone from the UI (nobody actually needed to tune it
// meet to meet), but the underlying behavior hasn't changed: the server
// still defaults it to 20 minutes (see routes/meets.js), so auto-created
// semis/finals are still never scheduled earlier than that after the
// athlete's last race actually finished.
function newMeetSettingsDialog(){
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(11,37,64,0.55);display:flex;align-items:center;justify-content:center;z-index:9999;';
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:10px;padding:22px;max-width:340px;width:90%;box-shadow:0 10px 40px rgba(0,0,0,0.3);font-family:inherit">
        <p style="margin:0 0 12px;font-weight:600;color:#0B2540">Venue & schedule settings</p>
        <label style="display:block;font-size:13px;color:#6B7480;margin-bottom:4px">Type of race</label>
        <select id="newMeetRaceType" style="width:100%;padding:10px;font-size:15px;border-radius:6px;border:1px solid #D8DCE0;margin-bottom:4px">
          <option value="sprint" selected>Sprints</option>
          <option value="trilogy" disabled>Trilogy (coming soon)</option>
          <option value="marathon" disabled>Marathon (coming soon)</option>
          <option value="river" disabled>River (coming soon)</option>
        </select>
        <p style="margin:0 0 14px;font-size:12px;color:#6B7480">Sprints is what this app runs today. The others are on the roadmap.</p>
        <label style="display:block;font-size:13px;color:#6B7480;margin-bottom:4px">How many lanes?</label>
        <select id="newMeetLanes" style="width:100%;padding:10px;font-size:15px;border-radius:6px;border:1px solid #D8DCE0;margin-bottom:14px">
          ${[6,7,8,9,10].map(n => `<option value="${n}" ${n===9?'selected':''}>${n} lanes${n===9?' (ICF standard)':''}</option>`).join('')}
        </select>
        <label style="display:block;font-size:13px;color:#6B7480;margin-bottom:4px">How many days is this meet?</label>
        <input type="number" id="newMeetDays" value="1" min="1" style="width:100%;padding:10px;font-size:15px;border-radius:6px;border:1px solid #D8DCE0;margin-bottom:4px">
        <p style="margin:0 0 16px;font-size:12px;color:#6B7480">If more than 1, assign which distance/boat class runs on which day in Race Office once entries are imported.</p>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button id="newMeetCancel" style="padding:8px 14px;border-radius:6px;border:1px solid #D8DCE0;background:#fff;cursor:pointer;font-size:14px">Cancel</button>
          <button id="newMeetOk" style="padding:8px 14px;border-radius:6px;border:none;background:#0B2540;color:#fff;cursor:pointer;font-weight:600;font-size:14px">OK</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    document.getElementById('newMeetOk').onclick = () => {
      const raceType = document.getElementById('newMeetRaceType').value;
      const lanes = Number(document.getElementById('newMeetLanes').value);
      const numDays = Number(document.getElementById('newMeetDays').value);
      document.body.removeChild(overlay);
      resolve({ raceType, lanes, numDays });
    };
    document.getElementById('newMeetCancel').onclick = () => { document.body.removeChild(overlay); resolve(null); };
  });
}

async function initMeetBar(containerId, opts){
  const options = opts || {};
  const el = document.getElementById(containerId);
  if(!el) return;
  el.innerHTML = '<select id="meetSelect" style="max-width:260px"></select>';
  const sel = document.getElementById('meetSelect');
  const btn = document.getElementById('newMeetBtn');

  try {
    const meets = await (await fetch('/api/meets')).json();
    if(meets.length === 0){
      sel.innerHTML = '<option value="">No meets yet</option>';
    } else {
      const raceTypeLabel = { sprint: 'Sprints', trilogy: 'Trilogy', marathon: 'Marathon', river: 'River' };
      sel.innerHTML = meets.map(m => `<option value="${m.id}">${m.name} (${raceTypeLabel[m.raceType] || 'Sprints'}, ${m.lanes||9} lanes${m.numDays>1?', '+m.numDays+' days':''})</option>`).join('');
      const current = getMeetId();
      if(current && meets.some(m => m.id === current)) sel.value = current;
      else { setMeetId(sel.value); }
    }
  } catch (err) {
    sel.innerHTML = '<option value="">Couldn\'t load meets</option>';
  }

  sel.onchange = () => { setMeetId(sel.value); location.reload(); };
  if(!btn) return;
  btn.onclick = async () => {
    const name = prompt('Name this meet, e.g. "PSA Sprint 2026" or "Trilogy Series 2026 #1":');
    if(!name) return;
    const settings = await newMeetSettingsDialog();
    if(settings === null) return;
    const res = await fetch('/api/meets', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name, raceType: settings.raceType, lanes: settings.lanes, numDays: settings.numDays}) });
    const meet = await res.json();
    if(!res.ok){ alert(meet.error); return; }
    if(meet.lanes !== 9){
      alert(`Meet created with ${meet.lanes} lanes. Heads up: automatic ICF Appendix 1 semi/final progression only applies at the standard 9-lane course — at ${meet.lanes} lanes, heats will draw correctly but you'll advance semis/finals manually in Race Program.`);
    }
    setMeetId(meet.id);
    location.reload();
  };
}

// Highlight the nav link for the page you're currently on
(function highlightActiveNav(){
  document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;
    document.querySelectorAll('header.topbar nav a').forEach(a => {
      if(a.getAttribute('href') === path) a.classList.add('active');
    });
  });
})();

// ── Nav: split into SETUP and RACE DAY groups ─────────────────────
(function splitNav(){
  document.addEventListener('DOMContentLoaded', () => {
    const nav = document.querySelector('header.topbar nav');
    if(!nav) return;
    const links = Array.from(nav.querySelectorAll('a'));
    const setup = ['/admin.html','/race-sort.html','/draw.html','/program.html'];
    const raceDay = ['/tower.html','/weigh.html','/results.html','/board.html'];
    const mk = (label, hrefs) => {
      const g = document.createElement('span');
      g.className = 'nav-group';
      const l = document.createElement('span');
      l.className = 'nav-group-label';
      l.textContent = label;
      g.appendChild(l);
      hrefs.forEach(h => { const a = links.find(x => x.getAttribute('href') === h); if(a) g.appendChild(a); });
      return g;
    };
    const s = mk('SETUP', setup);
    const r = mk('RACE DAY', raceDay);
    nav.innerHTML = '';
    nav.appendChild(s);
    nav.appendChild(r);
  });
})();

// ── Setup progress strip ──────────────────────────────────────────
// Shown on the four setup pages. Fetches meet status once and renders
// a 5-step strip: Import → Sort → Draw → Program → Finalise. Replaces
// the long explanatory paragraphs — the next unticked step is what to do.
async function renderProgressStrip(containerId){
  const el = document.getElementById(containerId);
  const meetId = getMeetId();
  if(!el || !meetId){ if(el) el.innerHTML=''; return; }
  let s;
  try { s = await (await fetch(`/api/meets/${encodeURIComponent(meetId)}/setup-status`)).json(); }
  catch(e){ el.innerHTML=''; return; }
  const steps = [
    { key:'imported',  label:'1 · Entries imported', href:'/admin.html' },
    { key:'sorted',    label:'2 · Race Sort checked', href:'/race-sort.html' },
    { key:'drawn',     label:'3 · Draws confirmed',   href:'/draw.html' },
    { key:'programmed',label:'4 · Programme set',     href:'/program.html' },
    { key:'finalised', label:'5 · Finalised → Tower', href:'/program.html' },
  ];
  const here = window.location.pathname;
  let nextFound = false;
  el.innerHTML = `<div class="progress-strip">` + steps.map(st => {
    const done = !!s[st.key];
    const isNext = !done && !nextFound;
    if(isNext) nextFound = true;
    const cls = done ? 'done' : isNext ? 'next' : 'todo';
    const active = st.href === here ? ' here' : '';
    return `<a class="ps-step ${cls}${active}" href="${st.href}">${done?'✓ ':''}${st.label}</a>`;
  }).join('<span class="ps-arrow">›</span>') + `</div>`;
}

// ── Race-day mode ─────────────────────────────────────────────────
// Toggle in the meet bar. When on, the SETUP nav group collapses to a
// single small "Setup ▸" link so race-day operators only see Tower /
// Weigh / Results / Board. Stored per browser in localStorage.
function isRaceDayMode(){ return localStorage.getItem('paddleTimerRaceDay') === '1'; }
function setRaceDayMode(on){ localStorage.setItem('paddleTimerRaceDay', on ? '1' : '0'); applyRaceDayMode(); }

function applyRaceDayMode(){
  const on = isRaceDayMode();
  document.body.classList.toggle('race-day', on);
  const btn = document.getElementById('raceDayToggle');
  if(btn){
    btn.textContent = on ? '🏁 Race day: ON' : '🏁 Race day';
    btn.classList.toggle('active', on);
    btn.title = on ? 'Race-day mode is on — setup pages are collapsed. Click to show them.' : 'Hide setup pages for race-day operators.';
  }
}

(function initRaceDayToggle(){
  document.addEventListener('DOMContentLoaded', () => {
    const bar = document.getElementById('meetBar');
    if(!bar) return;
    const btn = document.createElement('button');
    btn.id = 'raceDayToggle';
    btn.onclick = () => setRaceDayMode(!isRaceDayMode());
    bar.appendChild(btn);
    applyRaceDayMode();
  });
})();
