'use strict';
/*
 * server.js — גשר מקומי בין האתר לבין מאוורר ההולוגרמה.
 *
 * הרצה:   node bridge/server.js
 * בדיקה:  http://127.0.0.1:8777/health
 *
 * האתר (index.html) שולח בקשה קטנה כשמזהים אדם, והגשר מתרגם אותה
 * לפקודה למאוורר דרך fanProtocol.js. בלי תלויות npm — Node בלבד.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const fan = require('./fanProtocol');
const holoBus = require('./holoBus');

const PORT = 8777;
const HOST = '127.0.0.1';

function loadVideos(){
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'videos.json'), 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('[bridge] failed to read videos.json:', e.message);
    return { default: { video: 1 }, people: [] };
  }
}

function normName(s){
  return (s || '')
    .toLowerCase()
    .replace(/[\u0591-\u05C7]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim().replace(/\s+/g, ' ');
}

function resolveVideo(name){
  const map = loadVideos();
  const q = normName(name);
  if (q){
    for (const p of (map.people || [])){
      for (const n of (p.names || [])){
        if (normName(n) === q) return { video: p.video, label: p.label, matched: n };
      }
    }
  }
  return { video: (map.default && map.default.video) || 1, label: 'default', matched: null };
}

function sendJson(res, code, obj){
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

function readBody(req){
  return new Promise((resolve)=>{
    let data = '';
    req.on('data', (c)=> { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', ()=> { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
  });
}

const server = http.createServer(async (req, res)=>{
  if (req.method === 'OPTIONS') return sendJson(res, 204, {});

  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  if (url.pathname === '/health'){
    return sendJson(res, 200, { ok:true, mock: fan.CONFIG.MOCK, port: PORT });
  }

  if (url.pathname === '/videos'){
    return sendJson(res, 200, loadVideos());
  }

  if (url.pathname === '/info'){
    try { const info = await fan.getInfo(); return sendJson(res, 200, { ok:true, ...info }); }
    catch (e){ return sendJson(res, 500, { ok:false, error: e.message }); }
  }

  if (url.pathname === '/play' && req.method === 'POST'){
    const body = await readBody(req);
    const name = body.name || '';
    const explicit = body.video;
    const chosen = (explicit !== undefined && explicit !== null)
      ? { video: explicit, label: 'explicit', matched: null }
      : resolveVideo(name);
    try {
      await fan.play(chosen.video);
      console.log(`[bridge] play name="${name}" -> video=${chosen.video} (${chosen.label})`);
      return sendJson(res, 200, { ok:true, name, ...chosen });
    } catch (e){
      console.error('[bridge] play failed:', e.message);
      return sendJson(res, 500, { ok:false, error: e.message });
    }
  }

  if (url.pathname === '/stop' && req.method === 'POST'){
    try { await fan.stop(); return sendJson(res, 200, { ok:true }); }
    catch (e){ return sendJson(res, 500, { ok:false, error: e.message }); }
  }

  if (url.pathname === '/power' && req.method === 'POST'){
    const body = await readBody(req);
    const on = (body.on === true || body.on === 1 || body.on === '1' || body.state === 'on');
    try {
      const r = on ? await fan.powerOn() : await fan.powerOff();
      console.log(`[bridge] power ${on ? 'ON' : 'OFF'}`, r);
      return sendJson(res, 200, { ok:true, power: on ? 'on' : 'off', result: r });
    } catch (e){
      console.error('[bridge] power failed:', e.message);
      return sendJson(res, 500, { ok:false, error: e.message });
    }
  }

  if (url.pathname === '/command' && req.method === 'POST'){
    const body = await readBody(req);
    const ascii = body.ascii || '';
    if (!ascii) return sendJson(res, 400, { ok:false, error: 'missing ascii' });
    try {
      const r = await fan.sendAscii(ascii);
      return sendJson(res, 200, { ok:true, result: r });
    } catch (e){
      return sendJson(res, 500, { ok:false, error: e.message });
    }
  }

  return sendJson(res, 404, { ok:false, error: 'not found' });
});

fan.connect().then(()=>{
  server.listen(PORT, HOST, ()=>{
    console.log(`[bridge] listening on http://${HOST}:${PORT}  (MOCK=${fan.CONFIG.MOCK})`);
    console.log('[bridge] endpoints: GET /health, GET /videos, POST /play {name|video}, POST /power {on}, POST /command {ascii}, POST /stop');
  });
  // מאזין לזמן-אמת: פקודות מהטלפון (דרך הברקוד) -> מאוורר
  holoBus.start(fan, resolveVideo);
});
