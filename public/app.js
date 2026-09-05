const $ = id => document.getElementById(id);
const symptoms = $('symptoms');
const count = $('char-count');
const analyze = $('analyze-btn');
const clear = $('clear-btn');
const statusBox = $('status');
const results = $('results');

let currentMatches = [];
let visible = 6;

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
}[c]));

function safeProfileUrl(value){
  try{
    const u = new URL(String(value || ''));
    if(u.protocol !== 'https:' || u.hostname !== 'lips.org.uk') return '#';
    return u.href;
  }catch{return '#';}
}

function updateCount(){
  count.textContent = `${symptoms.value.length.toLocaleString()} / 4,000`;
}

function showStatus(msg, error=false){
  statusBox.className = `status ${error ? 'error' : ''}`;
  statusBox.textContent = msg;
}

function hideStatus(){
  statusBox.className = 'status hidden';
  statusBox.textContent = '';
}

function chips(items, css='chip'){
  return (items || []).filter(Boolean).map(x => `<span class="${css}">${esc(x)}</span>`).join('');
}

function doctorCard(d, index){
  const secondarySpecialties = (d.specialties || [])
    .filter(Boolean)
    .filter(x => String(x).toLowerCase() !== String(d.specialty || '').toLowerCase())
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 4);
  const tags = [...(d.subSpecialties||[]), ...(d.expertise||[])]
    .filter(Boolean)
    .filter(x => !secondarySpecialties.some(s => String(s).toLowerCase() === String(x).toLowerCase()))
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 5);
  const reasons = (d.matchReasons || []).slice(0, 3);
  const url = safeProfileUrl(d.profileUrl);
  const lipsLocation = (d.locations || []).find(x => /lips healthcare/i.test(x?.name || ''));
  const priorityBadge = d.worksAtLipsHealthcare === true
    ? '<span class="badge lips-badge">LIPS Healthcare clinic</span>'
    : '';
  const bestBadge = index === 0 ? '<span class="badge best-badge">Top match</span>' : '';

  return `
    <article class="doctor ${index === 0 ? 'doctor-top' : ''}">
      <div class="doctor-head">
        <div>
          <div class="badges">${bestBadge}${priorityBadge}</div>
          <h3>${esc(d.name)}</h3>
        </div>
        <span class="match-level">${esc(d.matchLevel || 'Specialty match')}</span>
      </div>
      <div class="meta">
        <strong>${esc(d.specialty || 'LIPS Specialist')}</strong>
        ${secondarySpecialties.length ? `<div class="secondary-specialties"><span>Also listed under</span><div class="tag-row">${chips(secondarySpecialties, 'chip specialty-chip')}</div></div>` : ''}
        ${tags.length ? `<div class="tag-row">${chips(tags)}</div>` : ''}
        ${lipsLocation?.name ? `<div class="clinic-line">Consults at ${esc(lipsLocation.name)}</div>` : ''}
      </div>
      ${reasons.length ? `<div class="match-why"><b>Why this doctor</b>${reasons.map(x => `<span>${esc(x)}</span>`).join('')}</div>` : ''}
      ${url !== '#' ? `<a class="primary" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open LIPS Profile</a>` : ''}
    </article>`;
}

function render(data){
  currentMatches = Array.isArray(data.matches) ? data.matches : [];
  visible = Math.min(6, currentMatches.length);
  const r = data.routing || {};
  const specialty = r.specialty || 'No clear specialty';
  const shownCount = Math.min(visible, currentMatches.length);
  const dir = data.directory || {};
  const directoryIncomplete = Number(dir.specialists || 0) < 100 || Number(dir.specialties || 0) < 20 || !dir.lastUpdated;
  const usingPreservedDirectory = Boolean(dir.preservedPrevious && dir.lastUpdated);
  const positive = (r.matchedTerms || []).slice(0, 10);
  const negated = (r.negatedTerms || []).slice(0, 10);

  let html = `
    <div class="card">
      ${directoryIncomplete ? `<div class="directory-warning"><strong>Directory coverage warning:</strong> the local cache currently contains ${esc(dir.specialists || 0)} specialists across ${esc(dir.specialties || 0)} specialties and has not passed a successful live refresh yet.</div>` : ''}
      ${usingPreservedDirectory ? `<div class="directory-warning"><strong>Refresh warning:</strong> the latest update attempt did not pass the coverage gate, so the tool is safely using the last verified LIPS directory.</div>` : ''}
      <div class="summary-grid">
        <div class="metric">
          <span class="label">Suggested specialty</span>
          <span class="value">${esc(specialty)}</span>
        </div>
        <div class="metric">
          <span class="label">Suggested sub-specialty</span>
          <span class="value">${esc(r.subSpecialty || 'Not clearly identified')}</span>
        </div>
        <div class="metric">
          <span class="label">Confidence</span>
          <span class="value">${esc(r.confidence || 'Low')}</span>
        </div>
      </div>`;

  if(positive.length || negated.length){
    html += `<div class="assertion-summary">`;
    if(positive.length) html += `<div><b>Used for routing</b><div class="tag-row">${chips(positive, 'chip positive-chip')}</div></div>`;
    if(negated.length) html += `<div><b>Ignored because they were denied/absent</b><div class="tag-row">${chips(negated, 'chip negated-chip')}</div></div>`;
    html += `</div>`;
  }

  if(r.uncertain || !r.specialty){
    const alts = (r.alternatives || []).map(esc).join(' • ');
    html += `
      <div class="reason">
        <strong>Routing is not confident enough.</strong><br>
        ${esc(r.reason || 'The description does not clearly point to one specialty.')}
        ${alts ? `<br><b>Possible alternatives:</b> ${alts}` : ''}
        <br><b>Next step:</b> add the main positive symptom, body area, duration and relevant associated symptoms, or use clinical/GP triage.
      </div>`;
  } else {
    html += `<div class="reason"><strong>Routing rationale:</strong> ${esc(r.reason || '')}</div>`;
  }

  if(r.urgency?.urgent){
    html += `
      <div class="urgent">
        <strong>URGENT SYMPTOM FLAG</strong><br>
        Follow the organisation's emergency or urgent-care protocol immediately. This routing tool must not delay urgent clinical care.
      </div>`;
  }

  if(dir.preferLipsHealthcare){
    html += `<div class="priority-note"><strong>LIPS clinic priority:</strong> when doctors are clinically equivalent, specialists verified as consulting at LIPS Healthcare are listed first.</div>`;
  }

  html += `
      <div class="results-heading">
        <div>
          <p class="eyebrow">BEST DIRECTORY MATCHES</p>
          <h2>Recommended specialists</h2>
        </div>
        ${currentMatches.length ? `<span class="match-count">${shownCount} of ${currentMatches.length} shown</span>` : ''}
      </div>`;

  if(currentMatches.length){
    html += `<div id="doctor-grid" class="doctor-grid"></div><div id="more-container" class="more-container"></div>`;
  } else {
    html += `<div class="reason">No indexed specialist matched this route strongly enough. Verify the specialty manually in the LIPS directory.</div>`;
  }

  html += `</div>`;
  results.innerHTML = html;
  results.className = 'results';
  renderDoctors();
}

function renderDoctors(){
  const grid = $('doctor-grid');
  const moreContainer = $('more-container');
  if(!grid) return;

  grid.innerHTML = currentMatches.slice(0, visible).map((d, i) => doctorCard(d, i)).join('');
  if(moreContainer) moreContainer.replaceChildren();

  const countLabel = results.querySelector('.match-count');
  if(countLabel){
    countLabel.textContent = `${Math.min(visible, currentMatches.length)} of ${currentMatches.length} shown`;
  }

  if(moreContainer && currentMatches.length > visible){
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'primary show-more';
    more.textContent = `Show more specialists (${currentMatches.length - visible} remaining)`;
    more.addEventListener('click', () => {
      visible = Math.min(visible + 6, currentMatches.length);
      renderDoctors();
    }, { once: true });
    moreContainer.appendChild(more);
  }
}

async function run(){
  const value = symptoms.value.trim();
  if(!value){
    showStatus('Please describe the patient\'s symptoms before searching.', true);
    results.className = 'results hidden';
    return;
  }

  analyze.disabled = true;
  clear.disabled = true;
  analyze.textContent = 'Finding…';
  hideStatus();
  results.className = 'results hidden';

  try{
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({symptoms:value})
    });
    const data = await res.json().catch(() => ({}));
    if(!res.ok) throw new Error(data.error || 'Unable to analyse the description.');
    render(data);
  }catch(err){
    showStatus(err.message || 'Unable to analyse the description.', true);
  }finally{
    analyze.disabled = false;
    clear.disabled = false;
    analyze.textContent = 'Find Specialist';
  }
}

symptoms.addEventListener('input', updateCount);
analyze.addEventListener('click', run);
clear.addEventListener('click', () => {
  symptoms.value = '';
  updateCount();
  results.className = 'results hidden';
  hideStatus();
  symptoms.focus();
});
symptoms.addEventListener('keydown', e => {
  if((e.ctrlKey || e.metaKey) && e.key === 'Enter') run();
});

updateCount();
