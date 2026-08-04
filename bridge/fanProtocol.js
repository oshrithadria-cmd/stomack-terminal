'use strict';
/*
 * fanProtocol.js — תקשורת אל מאוורר ההולוגרמה (Z3L/Z3H).
 *
 * הפרוטוקול פוענח במלואו (04/08/2026) — ערוץ שליטה TCP אל FAN_IP:9910.
 * מבנה מסגרת:
 *     7E | DataLength(4 bytes, little-endian) | CommandType(1 byte) | Data(ASCII) | 7F
 *
 * פקודות שאומתו מול המאוורר האמיתי:
 *   0x01  קבלת מצב      → מחזיר 0x02 עם "DeviceId=..&DisplayImageId=<קובץ>&Power=..&DeviceName=Z3L"
 *   0x08  נגן קובץ      → Data="DisplayImageId=<שם קובץ>"  (נועל על הסרטון הזה) ✔
 *   0x0D  חשמל          → Data="Power=1" / "Power=0" ✔
 *   0x0F  בהירות        → Data="Luminance=NN" (+ "save" לשמירה)
 *
 * שם הקובץ הוא כפי שהוא מופיע ב-/extsd במאוורר (למשל sharon.mp4).
 */

const net = require('net');

const CONFIG = {
  MOCK: false,                 // true = רק לוג בלי שליחה (לפיתוח בלי מאוורר).
  FAN_IP: '172.20.10.5',       // כתובת המאוורר ברשת ה-hotspot. (DHCP — עלול להשתנות.)
  FAN_PORT: 9910,              // ערוץ השליטה
  CONNECT_TIMEOUT_MS: 3000,
};

const CMD = {
  INFO:   0x01,   // reply 0x02
  PLAY:   0x08,   // Data="DisplayImageId=<file>"
  POWER:  0x0d,   // Data="Power=1"/"Power=0"
  BRIGHT: 0x0f,   // Data="Luminance=NN"
};

function log(...a){ console.log('[fan]', ...a); }

/** בונה מסגרת פקודה תקנית: 7E | len(4 LE) | cmdType | data | 7F */
function buildFrame(cmdType, data){
  const payload = (data == null || data === '') ? Buffer.alloc(0) : Buffer.from(String(data), 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32LE(payload.length, 0);
  return Buffer.concat([Buffer.from([0x7e]), len, Buffer.from([cmdType & 0xff]), payload, Buffer.from([0x7f])]);
}

/**
 * פותח חיבור TCP קצר, שולח מסגרת אחת, אוסף תשובה למשך חלון קצר, וסוגר.
 * מחזיר Promise עם {sent, reply(hex), ascii}.
 */
function sendFrame(frame, gatherMs = 600){
  if (CONFIG.MOCK){
    log('MOCK send', frame.toString('hex'));
    return Promise.resolve({ mock:true, sent: frame.toString('hex'), ascii:'' });
  }
  return new Promise((resolve)=>{
    const socket = new net.Socket();
    let settled = false;
    let reply = Buffer.alloc(0);
    const finish = ()=>{
      if (settled) return; settled = true;
      try{ socket.destroy(); }catch{}
      resolve({ sent: frame.toString('hex'), reply: reply.toString('hex'), ascii: reply.toString('ascii') });
    };
    socket.setTimeout(CONFIG.CONNECT_TIMEOUT_MS);
    socket.on('timeout', finish);
    socket.on('error', (e)=>{ if(!settled){ settled=true; try{socket.destroy();}catch{} resolve({ error:e.message, sent: frame.toString('hex'), ascii:'' }); } });
    socket.on('data', (d)=>{ reply = Buffer.concat([reply, d]); });
    socket.connect(CONFIG.FAN_PORT, CONFIG.FAN_IP, ()=>{
      socket.write(frame);
      setTimeout(finish, gatherMs);
    });
  });
}

/** פקודת טקסט גולמית (ברירת מחדל: פקודת חשמל 0x0D — לתאימות לאחור עם "Power=1"). */
function sendAscii(ascii, cmdType = CMD.POWER){
  return sendFrame(buildFrame(cmdType, ascii));
}

async function powerOn(){  log('powerOn');  return sendFrame(buildFrame(CMD.POWER, 'Power=1')); }
async function powerOff(){ log('powerOff'); return sendFrame(buildFrame(CMD.POWER, 'Power=0')); }

/**
 * play(file) — מנגן קובץ מסוים ונועל עליו.
 * file = שם הקובץ כפי שהוא במאוורר (למשל "sharon.mp4"). אם ריק/חסר — רק מוודא שהמאוורר דלוק.
 * מוודא קודם שהמאוורר דלוק, ואז מגדיר את הסרטון.
 */
async function play(file){
  if (!file){ log('play (no file) -> ensure ON'); return powerOn(); }
  log('play ->', file);
  await sendFrame(buildFrame(CMD.POWER, 'Power=1'));         // ודא דלוק
  return sendFrame(buildFrame(CMD.PLAY, 'DisplayImageId=' + file)); // נגן ונעל
}

async function stop(){ return powerOff(); }

/** קורא את מצב המאוורר; מחזיר {current, power, raw}. */
async function getInfo(){
  const r = await sendFrame(buildFrame(CMD.INFO, ''), 800);
  const a = r.ascii || '';
  const img = /DisplayImageId=([^&]*)/.exec(a);
  const pw  = /Power=([^&]*)/.exec(a);
  return { current: img ? img[1] : null, power: pw ? pw[1] : null, raw: a };
}

async function connect(){
  log(CONFIG.MOCK ? 'connect (mock)' : `target ${CONFIG.FAN_IP}:${CONFIG.FAN_PORT}`);
  return { ok:true, mock: CONFIG.MOCK };
}

module.exports = { CONFIG, CMD, connect, play, stop, powerOn, powerOff, sendAscii, buildFrame, getInfo };
