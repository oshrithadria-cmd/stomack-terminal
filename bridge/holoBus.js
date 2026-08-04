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
    if (!msg || msg.t !== 'cue') return;

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
