// Records every spoken line in lines.js to audio/<id>.mp3 with OpenAI's gpt-audio (it performs the line
// instead of flatly reading it). Only fills gaps: delete an mp3 (or pass ids) to redo it.
//   node scripts/voice-gen.mjs                 -> all missing lines
//   node scripts/voice-gen.mjs c_hulk n_hulk   -> just these (overwrites)
//   VOICE=marin node scripts/voice-gen.mjs     -> different voice (default cedar)
// Key comes from OPENAI_API_KEY, or Code\massey-morning-show\.env.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { LINES } from '../lines.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'audio');
const MODEL = process.env.MODEL || 'gpt-audio';
const VOICE = process.env.VOICE || 'cedar';
const KEY = process.env.OPENAI_API_KEY || fs.readFileSync('C:/Users/Terre/Code/massey-morning-show/.env', 'utf8')
  .split(/\r?\n/).find(l => l.startsWith('OPENAI_API_KEY='))?.split('=').slice(1).join('=').replace(/^"|"$/g, '').trim();
if (!KEY) throw new Error('No OPENAI_API_KEY');

const SYSTEM = `You are the voice of "TJ's Hero Lab", a superhero dress-up mirror game for a 4-year-old boy (same narrator as his Hero Book).
Say the user's line EXACTLY as written, word for word. Do not add, drop, or change any words, and do not reply to it.
Delivery: an excited, warm cartoon-trailer announcer. Big smile, lots of energy, clear and friendly, never scary.
Slightly slower than normal so a preschooler can follow. Hero names get extra punch. "T.J." is said as the letters T J.
Countdown lines like "Three!" are short and crisp, like a launch countdown.
Never read stage directions aloud.`;

const lines = LINES;
const only = process.argv.slice(2);
const todo = Object.entries(lines).filter(([id]) => only.length ? only.includes(id) : !fs.existsSync(path.join(OUT, `${id}.mp3`)));
fs.mkdirSync(OUT, { recursive: true });
console.log(`${todo.length} lines to record with ${MODEL}/${VOICE}`);

const norm = s => s.toLowerCase().replace(/t\.?\s?j\.?/g, 'tj').replace(/[^a-z0-9]/g, '');
const loose = (a, b) => { // allow tiny transcription wobble (e.g. "Octavius" spellings), not dropped words
  a = norm(a); b = norm(b);
  if (a === b) return true;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length] <= Math.max(3, Math.round(a.length * 0.08));
};

async function record(id, text) {
  let last = '';
  for (let attempt = 1; attempt <= 4; attempt++) {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL, modalities: ['text', 'audio'], audio: { voice: VOICE, format: 'mp3' },
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: `Say exactly this, and nothing else:
"${text}"` }],
      }),
    });
    if (r.status === 429 || r.status >= 500) { await new Promise(s => setTimeout(s, 3000 * attempt)); continue; }
    const j = await r.json();
    if (!r.ok) throw new Error(`${id}: ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
    const a = j.choices[0].message.audio;
    last = a.transcript;
    if (!loose(a.transcript, text)) { console.log(`  retry ${id} (${attempt}): heard "${a.transcript}"`); continue; }
    const raw = path.join(OUT, `${id}.raw.mp3`), out = path.join(OUT, `${id}.mp3`);
    fs.writeFileSync(raw, Buffer.from(a.data, 'base64'));
    // Trim leading/trailing silence, then level everything to the same loudness.
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-af',
      'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm=I=-16:TP=-1.5:LRA=11',
      '-ar', '44100', '-b:a', '96k', out]);
    fs.unlinkSync(raw);
    return true;
  }
  console.log(`  GAVE UP ${id}: last heard "${last}"`);
  return false;
}

let done = 0, failed = [];
const queue = [...todo];
await Promise.all([...Array(4)].map(async () => {
  while (queue.length) {
    const [id, text] = queue.shift();
    try { if (await record(id, text)) done++; else failed.push(id); }
    catch (e) { console.log(`  ERROR ${e.message}`); failed.push(id); }
    if ((done + failed.length) % 20 === 0) console.log(`  ${done + failed.length}/${todo.length}`);
  }
}));
const have = fs.readdirSync(OUT).filter(f => f.endsWith('.mp3') && !f.endsWith('.raw.mp3')).map(f => f.slice(0, -4)).filter(id => lines[id]).sort();
fs.writeFileSync(path.join(OUT, 'lines.json'), JSON.stringify(have));
console.log(`recorded ${done}, failed ${failed.length}${failed.length ? ': ' + failed.join(' ') : ''}. lines.json lists ${have.length}/${Object.keys(lines).length}.`);
