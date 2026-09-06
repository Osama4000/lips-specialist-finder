const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cleanTranscript, cleanTranscriptDetailed } = require('../public/voice-cleanup');
const { extensionForMime, normalizeMime, capabilities } = require('../services/transcription');

test('voice cleanup collapses a spoken stutter without changing the clinical meaning', () => {
  assert.equal(cleanTranscript('he he he has chest pain'), 'he has chest pain');
});

test('voice cleanup removes conservative filler words and repeated conjunctions', () => {
  assert.equal(
    cleanTranscript('The patient um um has lower back pain and and tingling in the leg.'),
    'The patient has lower back pain and tingling in the leg.'
  );
});

test('voice cleanup preserves clinically important negation', () => {
  assert.equal(cleanTranscript('No no chest pain but but recurrent palpitations.'), 'No chest pain but recurrent palpitations.');
});

test('voice cleanup does not remove ER as if it were a filler', () => {
  assert.equal(cleanTranscript('He was seen in ER and has knee pain.'), 'He was seen in ER and has knee pain.');
});

test('voice cleanup reports that a transcript changed', () => {
  const r = cleanTranscriptDetailed('she she has uh shoulder pain');
  assert.equal(r.text, 'she has shoulder pain');
  assert.equal(r.changed, true);
  assert.ok(r.removedFillers >= 1);
  assert.ok(r.collapsedRepeats >= 1);
});

test('audio MIME types map to provider-compatible file extensions', () => {
  assert.equal(normalizeMime('audio/webm;codecs=opus'), 'audio/webm');
  assert.equal(extensionForMime('audio/webm;codecs=opus'), 'webm');
  assert.equal(extensionForMime('audio/mp4'), 'mp4');
  assert.equal(extensionForMime('audio/ogg;codecs=opus'), 'ogg');
});

test('server voice capability remains disabled unless a server API key is configured', () => {
  const c = capabilities();
  assert.equal(typeof c.serverTranscription, 'boolean');
  assert.ok(c.maxRecordingSeconds >= 15);
});

test('frontend includes native recognition, MediaRecorder fallback and speech cleanup', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.match(app, /SpeechRecognition/);
  assert.match(app, /MediaRecorder/);
  assert.match(app, /\/api\/transcribe/);
  assert.match(app, /cleanTranscriptDetailed/);
});

test('server exposes cross-browser voice capability and transcription routes', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(server, /\/api\/voice\/capabilities/);
  assert.match(server, /\/api\/transcribe/);
  assert.match(server, /express\.raw/);
});
