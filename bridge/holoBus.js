'use strict';
/*
 * holoBus.js — מאזין לערוץ זמן-אמת (MQTT) ומפעיל את המאוורר בהתאם.
 *
 * זה מה שמחבר את הטלפון של המבקר (שנפתח דרך הברקוד, מכל מקום באינטרנט)
 * אל ההולוגרמה שאצלך במקום — בזמן אמת.
 *
 *   טלפון (index.html rtPublish) --MQTT--> ברוקר ציבורי --MQTT--> holoBus --> מאוורר
 *
 * חשוב: ה-url וה-topic חייבים להיות זהים ל-const RT שב-index.html.
 * להתקנה חד-פעמית של החבילה:   cd bridge && npm install
 */

let mqtt;
try { mqtt = require('mqtt'); }
catch (e) {
  console.error('\n[holoBus] חסרה החבילה "mqtt". התקיני פעם אחת:');
  console.error('    cd bridge');
  console.error('    npm install\n');
}

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const PRINTER_NAME = process.env.STOMACK_PRINTER || 'PM-241';
const _printedIds = new Set();   // מניעת הדפסה כפולה של אותו דף

/**
 * מקבל תמונת data:image/png;base64 מהטלפון, שומר לקובץ זמני ומדפיס במדפסת התרמית.
 * כולל ניסיון חוזר (retry) כדי לעמוד בניתוקי Bluetooth רגעיים.
 */
function printDossierImage(dataURL, name) {
  const m = /^data:image\/\w+;base64,([\s\S]+)$/.exec(dataURL || '');
  if (!m) { console.error('[print] תמונה לא תקינה — מדלג'); return; }
  let file;
  try {
    file = path.join(os.tmpdir(), 'stomack_dossier_' + Date.now() + '.png');
    fs.writeFileSync(file, Buffer.from(m[1], 'base64'));
  } catch (e) { console.error('[print] כתיבת קובץ נכשלה:', e.message); return; }

  const ps1 = path.join(__dirname, 'printDossier.ps1');
  let attempts = 0;
  const tryPrint = () => {
    attempts++;
    execFile('powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1, '-ImagePath', file, '-Printer', PRINTER_NAME],
      { timeout: 30000 },
      (err, stdout, stderr) => {
        const out = ((stdout || '') + (stderr || '')).trim();
        if (out.includes('PRINTED OK')) {
          console.log('[print] הודפס ✔  (' + (name || 'ANONYMOUS') + ')');
          try { fs.unlinkSync(file); } catch (_) {}
          return;
        }
        if (attempts < 3) {
          console.log('[print] ניסיון ' + attempts + ' נכשל, מנסה שוב... ' + (out ? '(' + out + ')' : ''));
          return setTimeout(tryPrint, 2500);
        }
        console.error('[print] ההדפסה נכשלה אחרי 3 ניסיונות:', out || err && err.message);
        try { fs.unlinkSync(file); } catch (_) {}
      });
  };
  tryPrint();
}

// חייב להתאים ל-const RT שב-index.html (רק הסכימה שונה: כאן mqtt:// במקום wss://)
const RT = {
  url:   'mqtt://broker.hivemq.com:1883',
  topic: 'stomack/oshrit-h7k2/v1/cue',
};

/**
 * מפעיל את המאזין. מקבל את מודול המאוורר ואת פונקציית resolveVideo מהשרת.
 * מחזיר את לקוח ה-MQTT (או null אם החבילה חסרה).
 */
function start(fan, resolveVideo) {
  if (!mqtt) return null;

  const client = mqtt.connect(RT.url, { reconnectPeriod: 3000, connectTimeout: 8000 });

  client.on('connect', () => {
    client.subscribe(RT.topic, (err) => {
      if (err) console.error('[holoBus] subscribe error:', err.message);
      else console.log('[holoBus] מאזין ל-', RT.topic, ' — טלפון→מאוורר בזמן אמת פעיל ✔');
    });
  });

  client.on('reconnect', () => console.log('[holoBus] מתחבר מחדש לברוקר...'));
  client.on('error', (e) => console.error('[holoBus] mqtt error:', e.message));

  client.on('message', async (topic, buf) => {
    let msg;
    try { msg = JSON.parse(buf.toString('utf8')); } catch (e) { return; }
    if (!msg) return;

    // ----- הדפסת דף הסיכום (טלפון המבקר → כאן → מדפסת) -----
    if (msg.t === 'print') {
      if (msg.id && _printedIds.has(msg.id)) return;         // כבר הדפסנו את הדף הזה
      if (msg.id) { _printedIds.add(msg.id); if (_printedIds.size > 300) _printedIds.clear(); }
      console.log('[print] התקבל דף סיכום', msg.id || '', 'שם=' + (msg.name || ''));
      printDossierImage(msg.img, msg.name);
      return;
    }

    if (msg.t !== 'cue') return;

    const a = msg.action || {};
    try {
      if (a.name != null) {
        const v = resolveVideo(a.name);
        console.log(`[holoBus] cue=${msg.cue} name="${a.name}" -> video=${v.video} (${v.label})`);
        await fan.play(v.video);
        return;
      }
      if (a.video != null) {
        console.log(`[holoBus] cue=${msg.cue} video=${a.video}`);
        await fan.play(a.video);
        return;
      }
      if (a.ascii) {
        console.log(`[holoBus] cue=${msg.cue} ascii=${a.ascii}`);
        await fan.sendAscii(a.ascii);
        return;
      }
      if (a.power) {
        console.log(`[holoBus] cue=${msg.cue} power=${a.power}`);
        await (a.power === 'on' ? fan.powerOn() : fan.powerOff());
        return;
      }
    } catch (e) {
      console.error('[holoBus] action failed:', e.message);
    }
  });

  return client;
}

module.exports = { start, RT };
