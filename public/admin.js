const $ = id => document.getElementById(id);
const pw = $('password');
const status = $('admin-status');
const refreshBtn = $('refresh');
const updateBtn = $('update');
let pollTimer = null;

function auth(){
  return {'x-admin-password': pw.value};
}

function show(msg, error=false){
  status.className = `status ${error ? 'error' : ''}`;
  status.textContent = msg;
}

function titleCase(value){
  return String(value || 'idle').replace(/[-_]/g,' ').replace(/\b\w/g,m=>m.toUpperCase());
}

function renderProgress(progress={}, running=false){
  const total = Number(progress.total || progress.discovered || 0);
  const processed = Number(progress.processed || 0);
  const percent = Number.isFinite(Number(progress.percent))
    ? Math.max(0, Math.min(100, Number(progress.percent)))
    : (total ? Math.round((processed / total) * 100) : 0);
  $('stage').textContent = titleCase(progress.stage || (running ? 'starting' : 'idle'));
  $('progress-percent').textContent = `${percent}%`;
  $('progress-bar').value = percent;
  $('processed').textContent = `${processed} / ${total || 0}`;
  $('successful').textContent = Number(progress.successful || 0);
  $('progress-failed').textContent = Number(progress.failed || 0);
  $('retry-progress').textContent = `${Number(progress.retryProcessed || 0)} / ${Number(progress.retryTotal || 0)}`;
  $('progress-message').textContent = progress.message || (running ? 'Update is running…' : 'Ready.');
}

async function refresh(){
  try{
    const r = await fetch('/api/admin/status', {headers: auth(), cache:'no-store'});
    if(!r.ok) throw new Error(await r.text());
    const d = await r.json();
    $('count').textContent = d.count;
    $('updated').textContent = d.metadata?.lastUpdated ? new Date(d.metadata.lastUpdated).toLocaleString() : 'Never';
    $('discovered').textContent = d.metadata?.discovered ?? '—';
    $('specialties').textContent = d.metadata?.specialtyCount ?? '—';
    $('failed').textContent = d.metadata?.failed ?? '—';
    $('gate').textContent = d.metadata?.preservedPrevious ? 'PRESERVED' : 'PASSED';
    $('location-verified').textContent = d.metadata?.locationVerifiedCount ?? '—';
    $('lips-clinic').textContent = d.metadata?.lipsHealthcareSpecialistCount ?? '—';
    const scraperEnabled = d.serverScraperEnabled !== false;
    $('refresh-mode').textContent = scraperEnabled ? 'Server' : 'GitHub Actions / local';
    $('update-mode-note').textContent = scraperEnabled
      ? 'Server-side directory refresh is enabled.'
      : 'Low-memory mode: refresh the directory from GitHub Actions (Update LIPS specialist directory) or locally, then deploy. The web service stays focused on routing.';

    const running = Boolean(d.updateRunning);
    updateBtn.disabled = running || d.serverScraperEnabled === false;
    updateBtn.title = d.serverScraperEnabled === false ? 'Server-side crawling is disabled on this low-memory deployment.' : '';
    renderProgress(d.updateProgress || {}, running);

    if(running){
      show(d.updateProgress?.message || 'Update is running on the server…');
    }else if(d.lastUpdateResult?.error){
      show(`Last update failed: ${d.lastUpdateResult.error}`, true);
    }else if(d.updateProgress?.stage === 'preserved'){
      show(d.updateProgress.message || 'Coverage gate preserved the previous directory.', true);
    }else{
      show(d.updateProgress?.stage === 'completed' ? 'Update completed successfully.' : 'Ready.');
    }
    return running;
  }catch(e){
    show(e.message || 'Unable to read admin status.', true);
    return false;
  }
}

function stopPolling(){
  if(pollTimer){
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function update(){
  stopPolling();
  updateBtn.disabled = true;
  refreshBtn.disabled = true;
  try{
    const r = await fetch('/api/admin/update', {method:'POST', headers:auth()});
    if(!r.ok) throw new Error(await r.text());
    renderProgress({stage:'starting',message:'Starting optimized LIPS directory update…',percent:0}, true);
    show('Update started. Progress will refresh automatically.');

    pollTimer = setInterval(async () => {
      const running = await refresh();
      if(!running){
        stopPolling();
        refreshBtn.disabled = false;
        updateBtn.disabled = false;
      }
    }, 1200);
  }catch(e){
    show(e.message || 'Unable to start update.', true);
    refreshBtn.disabled = false;
    updateBtn.disabled = false;
  }
}

refreshBtn.addEventListener('click', refresh);
updateBtn.addEventListener('click', update);
pw.addEventListener('keydown', e => {if(e.key === 'Enter') refresh();});

renderProgress();
