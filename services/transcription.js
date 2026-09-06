const DEFAULT_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe';
const ENABLED = !/^(0|false|no)$/i.test(process.env.VOICE_TRANSCRIPTION_ENABLED || 'true');
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const MAX_AUDIO_BYTES = Math.max(256_000, Math.min(15_000_000, Number(process.env.VOICE_MAX_AUDIO_BYTES || 4_000_000)));
const MAX_RECORDING_SECONDS = Math.max(15, Math.min(180, Number(process.env.VOICE_MAX_RECORDING_SECONDS || 90)));

function isConfigured(){ return ENABLED && Boolean(OPENAI_API_KEY); }

function normalizeMime(mime){
  return String(mime || 'application/octet-stream').split(';')[0].trim().toLowerCase();
}

function extensionForMime(mime){
  const type = normalizeMime(mime);
  if(type === 'audio/webm') return 'webm';
  if(type === 'audio/ogg') return 'ogg';
  if(type === 'audio/mp4') return 'mp4';
  if(type === 'audio/mpeg') return 'mp3';
  if(type === 'audio/mp3') return 'mp3';
  if(type === 'audio/wav' || type === 'audio/x-wav') return 'wav';
  if(type === 'audio/flac') return 'flac';
  if(type === 'audio/aac') return 'aac';
  return 'webm';
}

async function transcribeAudio(buffer, { mimeType, filename } = {}){
  if(!isConfigured()){
    const err = new Error('Cross-browser voice transcription is not configured.');
    err.code = 'VOICE_TRANSCRIPTION_NOT_CONFIGURED';
    throw err;
  }
  if(!Buffer.isBuffer(buffer) || !buffer.length){
    const err = new Error('No audio was received.');
    err.code = 'EMPTY_AUDIO';
    throw err;
  }
  if(buffer.length > MAX_AUDIO_BYTES){
    const err = new Error('The voice note is too large. Please keep dictation short and try again.');
    err.code = 'AUDIO_TOO_LARGE';
    throw err;
  }

  const type = normalizeMime(mimeType);
  const ext = extensionForMime(type);
  const safeFilename = String(filename || `dictation.${ext}`).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120) || `dictation.${ext}`;
  const form = new FormData();
  form.append('model', DEFAULT_MODEL);
  form.append('language', 'en');
  form.append('file', new Blob([buffer], { type }), safeFilename);

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form,
    signal: AbortSignal.timeout(55_000)
  });
  const payload = await response.json().catch(() => ({}));
  if(!response.ok){
    const err = new Error(payload?.error?.message || `Speech-to-text provider returned HTTP ${response.status}.`);
    err.code = 'TRANSCRIPTION_PROVIDER_ERROR';
    err.status = response.status;
    throw err;
  }
  const text = String(payload?.text || '').trim();
  if(!text){
    const err = new Error('No speech could be transcribed from this recording.');
    err.code = 'NO_TRANSCRIPT';
    throw err;
  }
  return { text, provider: 'openai', model: DEFAULT_MODEL };
}

function capabilities(){
  return {
    serverTranscription: isConfigured(),
    provider: isConfigured() ? 'openai' : null,
    model: isConfigured() ? DEFAULT_MODEL : null,
    maxAudioBytes: MAX_AUDIO_BYTES,
    maxRecordingSeconds: MAX_RECORDING_SECONDS
  };
}

module.exports = { transcribeAudio, capabilities, isConfigured, extensionForMime, normalizeMime, MAX_AUDIO_BYTES, MAX_RECORDING_SECONDS };
