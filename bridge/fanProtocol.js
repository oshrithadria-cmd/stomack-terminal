'use strict';
/*
 * fanProtocol.js — תקשורת אל מאוורר ההולוגרמה (Z3H).
 *
 * הפרוטוקול פוענח מצילום Wireshark (03/08/2026):
 *   ערוץ שליטה: TCP אל FAN_IP:9910 (חיבור קבוע).
 *   מסגרת פקודה:  7E 07 00 00 00 0D  <ASCII>  7F
 *   דוגמאות שנתפסו ואומתו:
 *     Power off -> "Power=0"  => 7e 07 00 00 00 0d 50 6f 77 65 72 3d 30 7f
 *     Power on  -> "Power=1"  => 7e 07 00 00 00 0d 50 6f 77 65 72 3d 31 7f
 *   המאוורר עונה במסגרת דומה עם בייט 0E במקום 0D (אישור).
 *
 *   העלאת סרטונים: FTP רגיל על פורט 21 (טרם מומש כאן).
 *
 * מה שעדיין חסר: פקודת "נגן קובץ מסוים" (בחירת וידאו לפי שם/אינדקס).
 *   צריך צילום נוסף של פעולת "select file playback" כדי לפענח אותה.
 *   sendAscii() כבר מוכן לשלוח כל פקודת טקסט ברגע שנדע את הפורמט.
 */

const net = require('net');

const CONFIG = {
  MOCK: false,                 // הפרוטוקול אמיתי ומאומת. true = רק לוג בלי שליחה.
  FAN_IP: '192.168.10.123',    // כתובת המאוורר (ברשת ה-hotspot שלו). ניתן לשנות.
  FAN_PORT: 9910,              // ערוץ השליטה
  CONNECT_TIMEOUT_MS: 3000,
};

const FRAME_HEAD = Buffer.from([0x7e, 0x07, 0x00, 0x00, 0x00, 0x0d]);
const FRAME_TAIL = Buffer.from([0x7f]);

function log(...a){ console.log('[fan]', ...a); }

/** עוטף מחרוזת טקסט במסגרת הפקודה של המאוורר. */
function buildFrame(ascii){
  return Buffer.concat([FRAME_HEAD, Buffer.from(String(ascii), 'ascii'), FRAME_TAIL]);
}

/**
 * פותח חיבור TCP קצר, שולח מסגרת אחת, קורא תשובה (אם יש), וסוגר.
 * מחזיר Promise עם התשובה הגולמית (hex) או שגיאה.
 */
function sendFrame(frame){
  if (CONFIG.MOCK){
    log('MOCK send', frame.toString('hex'));
    return Promise.resolve({ mock:true, sent: frame.toString('hex') });
  }
  return new Promise((resolve, reject)=>{
    const socket = new net.Socket();
    let settled = false;
    let reply = Buffer.alloc(0);
    const done = (fn, arg)=>{ if(settled) return; settled = true; try{ socket.destroy(); }catch{} fn(arg); };

    socket.setTimeout(CONFIG.CONNECT_TIMEOUT_MS);
    socket.on('timeout', ()=> done(resolve, { sent: frame.toString('hex'), reply: reply.toString('hex'), note:'timeout(no/late reply)' }));
    socket.on('error', (e)=> done(reject, e));
    socket.on('data', (d)=>{ reply = Buffer.concat([reply, d]); done(resolve, { sent: frame.toString('hex'), reply: reply.toString('hex') }); });
    socket.connect(CONFIG.FAN_PORT, CONFIG.FAN_IP, ()=>{
      log('connected -> send', frame.toString('hex'));
      socket.write(frame);
    });
  });
}

/** שולח פקודת טקסט כלשהי (למשל "Power=1"). */
function sendAscii(ascii){
  return sendFrame(buildFrame(ascii));
}

async function powerOn(){  log('powerOn');  return sendAscii('Power=1'); }
async function powerOff(){ log('powerOff'); return sendAscii('Power=0'); }

/**
 * play(videoId) — בחירת/הפעלת וידאו לאדם מסוים.
 * TODO: הפורמט האמיתי טרם נלכד. כרגע לפחות מוודא שהמאוורר דלוק,
 *       כדי שכל הזרימה (אתר->גשר->מאוורר) תעבוד. יוחלף בפקודת הבחירה
 *       ברגע שנצלם אותה.
 */
async function play(videoId){
  log('play (temporary = ensure ON) ->', videoId);
  return powerOn();
  // בעתיד, משהו בסגנון: return sendAscii(`Play=${videoId}`);
}

async function stop(){ return powerOff(); }

async function connect(){
  log(CONFIG.MOCK ? 'connect (mock)' : `target ${CONFIG.FAN_IP}:${CONFIG.FAN_PORT}`);
  return { ok:true, mock: CONFIG.MOCK };
}

module.exports = { CONFIG, connect, play, stop, powerOn, powerOff, sendAscii, buildFrame };
