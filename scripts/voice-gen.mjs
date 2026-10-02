// Records every spoken line in lines.js to audio/<id>.mp3 with ElevenLabs, voiced by Tyler
// (the arena announcer from Turbo TJ, so TJ already knows him). Only fills gaps: delete an mp3 (or pass ids) to redo it.
//   node scripts/voice-gen.mjs                -> all missing lines
//   node scripts/voice-gen.mjs m_eye p_fire   -> just these (overwrites)
//   VOICE=<voice id> node scripts/voice-gen.mjs
// Key comes from ELEVENLABS_API_KEY, or Code\massey-morning-show\.env.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { LINES } from '../lines.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'audio');
const VOICE = process.env.VOICE || 'GyIXYY876myKNtA1j8NI';   // Tyler, arena announcer
const MODEL = process.env.MODEL || 'eleven_multilingual_v2';
const KEY = process.env.ELEVENLABS_API_KEY || fs.readFileSync('C:/Users/Terre/Code/massey-morning-show/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('ELEVENLABS_API_KEY='))?.split('=').slice(1).join('=').replace(/^"|"$/g, '').trim();
if (!KEY) throw new Error('No ELEVENLABS_API_KEY');

const only = process.argv.slice(2);
const todo = Object.entries(LINES).filter(([id]) => (only.length ? only.includes(id) : !fs.existsSync(path.join(OUT, `${id}.mp3`))));
fs.mkdirSync(OUT, { recursive: true });
console.log(`${todo.length} lines to record with ElevenLabs ${MODEL} / ${VOICE}`);

async function record(id, text) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({
        text, model_id: MODEL,
        voice_settings: { stability: 0.35, similarity_boost: 0.8, style: 0.45, use_speaker_boost: true },
      }),
    });
    if (r.status === 429 || r.status >= 500) { await new Promise((s) => setTimeout(s, 3000 * attempt)); continue; }
    if (!r.ok) { console.log(`  FAILED ${id}: ${r.status} ${(await r.text()).slice(0, 200)}`); return false; }
    const raw = path.join(OUT, `${id}.raw.mp3`), out = path.join(OUT, `${id}.mp3`);
    fs.writeFileSync(raw, Buffer.from(await r.arrayBuffer()));
    // Trim leading/trailing silence, then level everything to the same loudness.
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-af',
      'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm=I=-16:TP=-1.5:LRA=11',
      '-ar', '44100', '-b:a', '96k', out]);
    fs.unlinkSync(raw);
    return true;
  }
  console.log(`  GAVE UP ${id}`);
  return false;
}

let done = 0;
const failed = [], queue = [...todo];
await Promise.all([...Array(3)].map(async () => {
  while (queue.length) {
    const [id, text] = queue.shift();
    if (await record(id, text)) done++; else failed.push(id);
  }
}));
const have = Object.keys(LINES).filter((id) => fs.existsSync(path.join(OUT, `${id}.mp3`)));
fs.writeFileSync(path.join(OUT, 'lines.json'), JSON.stringify(have));
console.log(`recorded ${done}, failed ${failed.length}${failed.length ? ': ' + failed.join(' ') : ''}. lines.json lists ${have.length}/${Object.keys(LINES).length}.`);
