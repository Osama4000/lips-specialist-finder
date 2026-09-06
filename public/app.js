const $ = id => document.getElementById(id);
const symptoms = $('symptoms');
const count = $('char-count');
const analyze = $('analyze-btn');
const clear = $('clear-btn');
const statusBox = $('status');
const results = $('results');
const micBtn = $('mic-btn');
const micStatus = $('mic-status');
const voiceCleanup = window.LipsVoiceCleanup || { cleanTranscript: value => String(value || ''), cleanTranscriptDetailed: value => ({ text: String(value || ''), changed: false, removedFillers: 0, collapsedRepeats: 0 }) };

let currentMatches = [];
let visible = 5;
let currentClarification = null;
let recognition = null;
let listening = false;
let voiceMode = 'none';
let serverVoiceAvailable = false;
let voiceCapabilities = { maxRecordingSeconds: 90 };
let dictationBase = '';
let dictationFinal = '';
let mediaRecorder = null;
let mediaStream = null;
let audioChunks = [];
let recordingTimer = null;
let transcriptionPending = false;

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

function updateCount(){ count.textContent = `${symptoms.value.length.toLocaleString()} / 4,000`; }
function showStatus(msg, error=false){ statusBox.className = `status ${error ? 'error' : ''}`; statusBox.textContent = msg; }
function hideStatus(){ statusBox.className = 'status hidden'; statusBox.textContent = ''; }
function chips(items, css='chip'){ return (items || []).filter(Boolean).map(x => `<span class="${css}">${esc(x)}</span>`).join(''); }

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
    .slice(0, 6);
  const reasons = (d.matchReasons || []).slice(0, 4);
  const url = safeProfileUrl(d.profileUrl);
  const lipsLocation = (d.locations || []).find(x => /lips healthcare/i.test(x?.name || ''));
  const priorityBadge = d.worksAtLipsHealthcare === true ? '<span class="badge lips-badge">LIPS Healthcare</span>' : '';
  const bestBadge = index === 0 && !d.scopeMismatch ? '<span class="badge best-badge">Best match</span>' : '';
  const broaderBadge = d.scopeMismatch ? '<span class="badge broader-badge">Broader specialty match</span>' : '';
  const routeLine = d.routeSpecialty && d.routeSpecialty !== d.specialty ? `<div class="route-line">Matched via ${esc(d.routeSpecialty)}</div>` : '';

  return `
    <article class="doctor ${index === 0 && !d.scopeMismatch ? 'doctor-top' : ''} ${d.scopeMismatch ? 'doctor-broader' : ''}">
      <div class="doctor-head">
        <div>
          <div class="badges">${bestBadge}${priorityBadge}${broaderBadge}</div>
          <h3>${esc(d.name)}</h3>
        </div>
        <span class="match-level">${esc(d.matchLevel || 'Specialty match')}</span>
      </div>
      <div class="meta">
        <strong>${esc(d.specialty || 'LIPS Specialist')}</strong>
        ${routeLine}
        ${secondarySpecialties.length ? `<div class="secondary-specialties"><span>Also listed under</span><div class="tag-row">${chips(secondarySpecialties, 'chip specialty-chip')}</div></div>` : ''}
        ${tags.length ? `<div class="tag-row">${chips(tags)}</div>` : ''}
        ${lipsLocation?.name ? `<div class="clinic-line">Consults at ${esc(lipsLocation.name)}</div>` : ''}
      </div>
      ${reasons.length ? `<div class="match-why"><b>Why this doctor</b>${reasons.map(x => `<span>${esc(x)}</span>`).join('')}</div>` : ''}
      ${url !== '#' ? `<a class="primary" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open LIPS Profile</a>` : ''}
    </article>`;
}

const contextLabels = {
  present: ['Current / used for routing', 'positive-chip'],
  uncertain: ['Possible / uncertain', 'uncertain-chip'],
  historical: ['Past history — not treated as current', 'history-chip'],
  resolved: ['Resolved — ignored for current routing', 'history-chip'],
  family: ['Family / other person — ignored', 'history-chip'],
  negated: ['Ignored because they were denied/absent', 'negated-chip']
};

function contextPanel(summary){
  const groups = Object.entries(contextLabels)
    .map(([key,[label,css]]) => ({ key, label, css, items: summary?.[key] || [] }))
    .filter(x => x.items.length);
  if(!groups.length) return '';
  return `<div class="context-panel"><div class="context-panel-head"><b>What the engine understood</b><span>Context is applied before specialty scoring</span></div><div class="context-grid">${groups.map(g => `<div class="context-group"><span>${esc(g.label)}</span><div class="tag-row">${chips(g.items, `chip ${g.css}`)}</div></div>`).join('')}</div></div>`;
}

function clarificationCard(c){
  if(!c?.question || !Array.isArray(c.options) || !c.options.length) return '';
  return `<div class="clarify-card"><div><p class="eyebrow">ONE QUICK QUESTION</p><strong>${esc(c.question)}</strong><p>Choose an answer to add it to the note and refine the ranking.</p></div><div class="clarify-options">${c.options.map((o,i)=>`<button type="button" class="clarify-option" data-clarify-index="${i}">${esc(o.label)}</button>`).join('')}</div></div>`;
}

function render(data){
  currentMatches = Array.isArray(data.matches) ? data.matches : [];
  visible = Math.min(5, currentMatches.length);
  const r = data.routing || {};
  currentClarification = r.clarification || null;
  const specialty = r.specialty || 'No clear specialty';
  const shownCount = Math.min(visible, currentMatches.length);
  const dir = data.directory || {};
  const directoryIncomplete = Number(dir.specialists || 0) < 100 || Number(dir.specialties || 0) < 20 || !dir.lastUpdated;
  const usingPreservedDirectory = Boolean(dir.preservedPrevious && dir.lastUpdated);

  let html = `
    <div class="card">
      ${directoryIncomplete ? `<div class="directory-warning"><strong>Directory coverage warning:</strong> ${esc(dir.specialists || 0)} specialists across ${esc(dir.specialties || 0)} specialties are currently indexed.</div>` : ''}
      ${usingPreservedDirectory ? `<div class="directory-warning"><strong>Refresh warning:</strong> the latest refresh was rejected, so the last verified LIPS directory is being used.</div>` : ''}
      <div class="summary-grid">
        <div class="metric"><span class="label">Suggested specialty</span><span class="value">${esc(specialty)}</span></div>
        <div class="metric"><span class="label">Suggested sub-specialty</span><span class="value">${esc(r.subSpecialty || 'Not clearly identified')}</span></div>
        <div class="metric"><span class="label">Confidence</span><span class="value confidence-${String(r.confidence||'low').toLowerCase()}">${esc(r.confidence || 'Low')}</span></div>
      </div>
      ${contextPanel(r.contextSummary)}
      ${r.alternatives?.length ? `<div class="alternatives"><b>Other plausible specialty routes</b><div class="tag-row">${chips(r.alternatives,'chip specialty-chip')}</div></div>` : ''}`;

  if(r.uncertain || !r.specialty){
    html += `<div class="reason"><strong>More context would improve the route.</strong><br>${esc(r.reason || 'The note does not clearly point to one specialty.')}</div>`;
  } else {
    html += `<div class="reason"><strong>Routing rationale:</strong> ${esc(r.reason || '')}</div>`;
  }

  html += clarificationCard(currentClarification);

  if(r.urgency?.urgent){
    const labels = (r.urgency.rules || []).map(x => x.label).filter(Boolean);
    html += `<div class="urgent"><strong>URGENT SAFETY FLAG</strong><br>${labels.length ? `${esc(labels.join(' • '))}<br>` : ''}Follow the organisation's approved emergency/urgent-care protocol immediately. Routine specialist recommendations are hidden so they do not delay escalation.</div>`;
  }

  if(dir.preferLipsHealthcare){
    html += `<div class="priority-note"><strong>LIPS clinic priority:</strong> LIPS Healthcare consultants are preferred only when clinical suitability is equivalent. Exact specialty/sub-specialty fit remains the first priority.</div>`;
  }

  if(!r.urgency?.urgent){
    html += `<div class="results-heading"><div><p class="eyebrow">SHORTLIST</p><h2>Recommended specialists</h2><p class="results-sub">Strongest clinical matches first; broad scope mismatches are pushed to the bottom.</p></div>${currentMatches.length ? `<span class="match-count">${shownCount} of ${currentMatches.length} shown</span>` : ''}</div>`;
    if(currentMatches.length) html += `<div id="doctor-grid" class="doctor-grid"></div><div id="more-container" class="more-container"></div>`;
    else html += `<div class="reason">No indexed specialist matched strongly enough. Add one more clinically relevant detail or verify the route manually.</div>`;
  }

  html += `</div>`;
  results.innerHTML = html;
  results.className = 'results';
  bindClarification();
  if(!r.urgency?.urgent) renderDoctors();
}

function bindClarification(){
  if(!currentClarification) return;
  results.querySelectorAll('[data-clarify-index]').forEach(btn => {
    btn.addEventListener('click', () => {
      const option = currentClarification.options?.[Number(btn.dataset.clarifyIndex)];
      if(!option?.append) return;
      const base = symptoms.value.trim();
      symptoms.value = `${base}${base ? '\n' : ''}${option.append}`.slice(0,4000);
      updateCount();
      run();
    });
  });
}

function renderDoctors(){
  const grid = $('doctor-grid');
  const moreContainer = $('more-container');
  if(!grid) return;
  grid.innerHTML = currentMatches.slice(0, visible).map((d, i) => doctorCard(d, i)).join('');
  if(moreContainer) moreContainer.replaceChildren();
  const countLabel = results.querySelector('.match-count');
  if(countLabel) countLabel.textContent = `${Math.min(visible, currentMatches.length)} of ${currentMatches.length} shown`;
  if(moreContainer && currentMatches.length > visible){
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'secondary show-more';
    more.textContent = `Show more (${currentMatches.length - visible})`;
    more.addEventListener('click', () => { visible = Math.min(visible + 5, currentMatches.length); renderDoctors(); }, { once: true });
    moreContainer.appendChild(more);
  }
}

async function run(){
  const value = symptoms.value.trim();
  if(!value){ showStatus('Please type or dictate the patient note before searching.', true); results.className = 'results hidden'; return; }
  if(listening) stopDictation();
  analyze.disabled = true; clear.disabled = true; analyze.textContent = 'Finding…'; hideStatus(); results.className = 'results hidden';
  try{
    const res = await fetch('/api/analyze', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({symptoms:value}) });
    const data = await res.json().catch(() => ({}));
    if(!res.ok) throw new Error(data.error || 'Unable to analyse the note.');
    render(data);
  }catch(err){ showStatus(err.message || 'Unable to analyse the note.', true); }
  finally{ analyze.disabled = false; clear.disabled = false; analyze.textContent = 'Find Specialist'; }
}

function setMicState(active, message='', mode=voiceMode){
  listening = active;
  micBtn.classList.toggle('listening', active);
  micBtn.classList.toggle('transcribing', transcriptionPending);
  micBtn.setAttribute('aria-label', active ? 'Stop voice dictation' : 'Start voice dictation');
  const label = micBtn.querySelector('span');
  if(label) label.textContent = transcriptionPending ? 'Transcribing…' : (active ? 'Stop' : 'Dictate');
  micBtn.disabled = transcriptionPending || mode === 'none';
  if(analyze) analyze.disabled = active || transcriptionPending;
  if(message){ micStatus.textContent = message; micStatus.className = `mic-status ${active ? 'active' : ''}`; }
  else micStatus.className = 'mic-status hidden';
}

function appendDictation(text, { final=true } = {}){
  const detail = voiceCleanup.cleanTranscriptDetailed(text);
  const cleaned = detail.text.trim();
  if(!cleaned) return detail;
  if(final) dictationFinal += `${dictationFinal ? ' ' : ''}${cleaned}`;
  const parts = [dictationBase, dictationFinal].map(x => x.trim()).filter(Boolean);
  symptoms.value = parts.join(parts.length > 1 && dictationBase ? '\n' : ' ').slice(0,4000);
  updateCount();
  return detail;
}

function renderNativeTranscript(interim=''){
  const cleanInterim = voiceCleanup.cleanTranscript(interim).trim();
  const parts = [dictationBase, dictationFinal, cleanInterim].map(x => x.trim()).filter(Boolean);
  symptoms.value = parts.join(parts.length > 1 && dictationBase ? '\n' : ' ').slice(0,4000);
  updateCount();
}

function nativeRecognitionConstructor(){ return window.SpeechRecognition || window.webkitSpeechRecognition || null; }
function mediaRecordingSupported(){ return Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder); }

function chooseAudioMimeType(){
  if(!window.MediaRecorder?.isTypeSupported) return '';
  return [
    'audio/webm;codecs=opus',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/webm'
  ].find(type => MediaRecorder.isTypeSupported(type)) || '';
}

function extensionForMime(mime){
  const type = String(mime || '').split(';')[0].toLowerCase();
  if(type === 'audio/mp4') return 'mp4';
  if(type === 'audio/ogg') return 'ogg';
  if(type === 'audio/mpeg') return 'mp3';
  if(type === 'audio/wav') return 'wav';
  return 'webm';
}

function initNativeRecognition(SpeechRecognition){
  recognition = new SpeechRecognition();
  recognition.lang = 'en-GB';
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => setMicState(true, 'Listening… speak naturally. Repeated words and fillers such as “um” are cleaned automatically.');
  recognition.onresult = event => {
    let interim = '';
    for(let i = event.resultIndex; i < event.results.length; i++){
      const transcript = String(event.results[i][0]?.transcript || '').trim();
      if(!transcript) continue;
      if(event.results[i].isFinal) appendDictation(transcript);
      else interim += `${interim ? ' ' : ''}${transcript}`;
    }
    renderNativeTranscript(interim);
  };
  recognition.onerror = event => {
    const map = {
      'not-allowed':'Microphone permission was blocked. Allow microphone access and try again.',
      'service-not-allowed':'This browser blocked its native speech-recognition service.',
      'no-speech':'No speech was detected. Try again or type the note.',
      'network':'The browser speech-recognition service could not be reached.',
      'language-not-supported':'English speech recognition is not available in this browser.'
    };
    listening = false;
    if(serverVoiceAvailable && mediaRecordingSupported() && ['network','service-not-allowed','language-not-supported'].includes(event.error)){
      voiceMode = 'recorder';
      setMicState(false, `${map[event.error]} The next dictation will use the cross-browser transcription fallback.`);
      return;
    }
    setMicState(false, map[event.error] || 'Voice dictation stopped. You can continue typing.');
  };
  recognition.onend = () => {
    if(listening) setMicState(false, 'Dictation stopped. Review the cleaned note, then find a specialist.');
  };
}

async function loadVoiceCapabilities(){
  try{
    const res = await fetch('/api/voice/capabilities', { cache: 'no-store' });
    if(res.ok){
      voiceCapabilities = await res.json();
      serverVoiceAvailable = Boolean(voiceCapabilities.serverTranscription);
    }
  }catch{}
}

async function initVoice(){
  await loadVoiceCapabilities();
  const SpeechRecognition = nativeRecognitionConstructor();
  if(SpeechRecognition){
    voiceMode = 'native';
    initNativeRecognition(SpeechRecognition);
    micBtn.title = 'Dictate note. Speech hesitations and immediate repeated words are cleaned automatically.';
    setMicState(false, 'Voice ready. Speak naturally — fillers and repeated words are cleaned automatically.');
    return;
  }
  if(serverVoiceAvailable && mediaRecordingSupported()){
    voiceMode = 'recorder';
    micBtn.title = 'Record a short voice note for secure transcription.';
    setMicState(false, 'Cross-browser voice mode ready. Audio is transcribed after you press Stop and is not stored by this app.');
    return;
  }
  voiceMode = 'none';
  micBtn.classList.add('unsupported');
  micBtn.title = 'This browser has no native speech recognition and server transcription is not configured.';
  setMicState(false, /iPhone|iPad|iPod/i.test(navigator.userAgent)
    ? 'Voice transcription is unavailable in this browser. You can still use the microphone on the iPhone keyboard to dictate into the note field.'
    : 'Voice transcription is unavailable in this browser. Type the note, or configure the optional cross-browser speech-to-text fallback.');
}

function startNativeDictation(){
  if(!recognition || listening) return;
  dictationBase = symptoms.value.trim();
  dictationFinal = '';
  try{ recognition.start(); }
  catch{ setMicState(false, 'Could not start native dictation. Try again in a moment.'); }
}

async function startRecorderDictation(){
  if(listening || transcriptionPending || !serverVoiceAvailable) return;
  try{
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    const mimeType = chooseAudioMimeType();
    mediaRecorder = mimeType ? new MediaRecorder(mediaStream, { mimeType, audioBitsPerSecond: 48000 }) : new MediaRecorder(mediaStream, { audioBitsPerSecond: 48000 });
    audioChunks = [];
    dictationBase = symptoms.value.trim();
    dictationFinal = '';
    mediaRecorder.ondataavailable = event => { if(event.data?.size) audioChunks.push(event.data); };
    mediaRecorder.onerror = () => setMicState(false, 'The browser could not record this voice note. You can continue typing.');
    mediaRecorder.onstop = () => { void finishRecordedDictation(); };
    mediaRecorder.start(1000);
    setMicState(true, 'Recording… speak naturally, then press Stop. Repeated words and fillers will be cleaned after transcription.');
    const seconds = Number(voiceCapabilities.maxRecordingSeconds || 90);
    recordingTimer = setTimeout(() => { if(listening) stopRecorderDictation(true); }, seconds * 1000);
  }catch(err){
    cleanupMediaStream();
    const blocked = err?.name === 'NotAllowedError' || err?.name === 'SecurityError';
    setMicState(false, blocked ? 'Microphone permission was blocked. Allow microphone access and try again.' : 'Could not access the microphone in this browser.');
  }
}

function cleanupMediaStream(){
  if(recordingTimer){ clearTimeout(recordingTimer); recordingTimer = null; }
  if(mediaStream){ mediaStream.getTracks().forEach(track => track.stop()); mediaStream = null; }
}

function stopRecorderDictation(auto=false){
  if(!mediaRecorder || mediaRecorder.state === 'inactive') return;
  listening = false;
  if(recordingTimer){ clearTimeout(recordingTimer); recordingTimer = null; }
  setMicState(false, auto ? 'Maximum voice-note length reached. Transcribing…' : 'Transcribing voice note…');
  try{ mediaRecorder.stop(); }catch{ cleanupMediaStream(); }
}

async function finishRecordedDictation(){
  const recorder = mediaRecorder;
  mediaRecorder = null;
  const mimeType = recorder?.mimeType || audioChunks[0]?.type || 'audio/webm';
  const blob = new Blob(audioChunks, { type: mimeType });
  audioChunks = [];
  cleanupMediaStream();
  if(!blob.size){ setMicState(false, 'No audio was captured. Try again or type the note.'); return; }
  transcriptionPending = true;
  setMicState(false, 'Transcribing voice note…');
  try{
    const ext = extensionForMime(mimeType);
    const res = await fetch('/api/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': mimeType || 'application/octet-stream', 'X-Audio-Filename': `dictation.${ext}` },
      body: blob
    });
    const data = await res.json().catch(() => ({}));
    if(!res.ok) throw new Error(data.error || 'Unable to transcribe this voice note.');
    const detail = appendDictation(data.text || '');
    const cleanupBits = [];
    if(detail.removedFillers) cleanupBits.push(`${detail.removedFillers} filler${detail.removedFillers === 1 ? '' : 's'}`);
    if(detail.collapsedRepeats) cleanupBits.push(`${detail.collapsedRepeats} repeated phrase${detail.collapsedRepeats === 1 ? '' : 's'}`);
    setMicState(false, cleanupBits.length ? `Dictation added. Cleaned ${cleanupBits.join(' and ')}.` : 'Dictation added. Review the note, then find a specialist.');
  }catch(err){
    setMicState(false, err.message || 'Unable to transcribe this voice note. You can continue typing.');
  }finally{
    transcriptionPending = false;
    setMicState(false, micStatus.textContent);
  }
}

function startDictation(){
  if(voiceMode === 'native') startNativeDictation();
  else if(voiceMode === 'recorder') void startRecorderDictation();
}

function stopDictation(){
  if(voiceMode === 'native' && recognition && listening){
    listening = false;
    try{ recognition.stop(); }catch{}
    setMicState(false, 'Dictation stopped. Review the cleaned note, then find a specialist.');
  } else if(voiceMode === 'recorder' && listening){
    stopRecorderDictation(false);
  }
}

symptoms.addEventListener('input', updateCount);
analyze.addEventListener('click', run);
clear.addEventListener('click', () => { if(listening) stopDictation(); symptoms.value = ''; updateCount(); results.className = 'results hidden'; hideStatus(); symptoms.focus(); });
micBtn.addEventListener('click', () => listening ? stopDictation() : startDictation());
symptoms.addEventListener('keydown', e => { if((e.ctrlKey || e.metaKey) && e.key === 'Enter') run(); });

void initVoice();
updateCount();
