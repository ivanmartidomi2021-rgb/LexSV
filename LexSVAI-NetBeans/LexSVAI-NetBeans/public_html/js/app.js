'use strict';
// ══ CLAVE GEMINI — CÁMBIELA AQUÍ ══════════════════════════════
const GEMINI_KEY = 'AIzaSyAQ.Ab8RN6IHRMO97zyVSAtZMSetIqGC7GMXwYNeAlRwZSk0vYVSqA';
// Clave gratis en: https://aistudio.google.com/app/apikey
// ═════════════════════════════════════════════════════════════

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;

const SYSTEM = `Eres LexSV AI, asistente jurídico especializado EXCLUSIVAMENTE en legislación vigente de la República de El Salvador. Apoyas a policías, fiscales, jueces, abogados, agentes de tránsito y estudiantes de derecho.
LEGISLACIÓN: Constitución SV 1983, Código Penal, CPP, Ley de Tránsito, Ley Penal Juvenil, LEIV, Ley contra Crimen Organizado, Ley contra Terrorismo, Ley Proscripción Maras, Ley Drogas, Ley Armas, Reglamentos PNC.
FORMATO OBLIGATORIO:
🔍 POSIBLE DELITO(S): [nombre]
📖 ARTÍCULOS APLICABLES: [Art. X, Ley Y – texto]
⚖️ GRAVEDAD: [Baja/Media/Alta/Muy Alta]
📋 PROCEDIMIENTO: [pasos numerados]
🚨 DERECHOS DEL DETENIDO: [listar cuando aplique]
⚠️ ADVERTENCIAS: [riesgos legales]
🏛️ INSTITUCIÓN COMPETENTE: [PNC/FGR/CSJ]
Sé claro, conciso y profesional. Cita artículos exactos.`;

const S = {
  user: localStorage.getItem('lx_user') || 'Agente',
  role: localStorage.getItem('lx_role') || 'PNC',
  history: [], favs: [], queries: [],
  camFile: null, recog: null, voiceOn: false,
};

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    document.getElementById('splashScreen').classList.add('hidden');
    if (localStorage.getItem('lx_user')) showApp();
    else document.getElementById('loginScreen').classList.add('active');
  }, 2500);
  loadFavs(); loadQueries(); buildOffline(); registerSW();
});

// ── AUTH ──────────────────────────────────────────────────────
function doLogin() {
  const u = document.getElementById('loginUser').value.trim() || 'Agente';
  const r = document.getElementById('loginRole').value;
  S.user = u; S.role = r;
  localStorage.setItem('lx_user', u); localStorage.setItem('lx_role', r);
  document.getElementById('loginScreen').classList.remove('active');
  showApp();
}
function showApp() {
  document.getElementById('appScreen').classList.add('active');
  document.getElementById('profileName').textContent = S.user;
  document.getElementById('profileRole').textContent = S.role;
  document.getElementById('profileAvatar').textContent = S.user[0].toUpperCase();
  botMsg(`¡Bienvenido, <strong>${esc(S.user)}</strong>! Soy LexSV AI. ¿En qué le puedo asistir?`);
  checkGemini();
}
function doLogout() {
  localStorage.removeItem('lx_user'); localStorage.removeItem('lx_role'); location.reload();
}

// ── GEMINI ────────────────────────────────────────────────────
async function gemini(userText, extraSys = '', imgBase64 = null, imgMime = null) {
  const clave = GEMINI_KEY.trim();
  if (!clave || clave.includes('XXXXX') || clave.length < 30) {
    throw new Error('⚠️ Clave Gemini no configurada. Abre js/app.js y pon tu clave en la línea 3.');
  }
  const userParts = [];
  if (imgBase64 && imgMime) userParts.push({ inline_data: { mime_type: imgMime, data: imgBase64 } });
  userParts.push({ text: userText });
  const contents = [
    { role:'user',  parts:[{ text:'Eres LexSV AI. ' + SYSTEM + (extraSys ? '\n' + extraSys : '') + '\nConfirma tu rol.' }] },
    { role:'model', parts:[{ text:'Entendido. Soy LexSV AI, asistente jurídico de El Salvador. Listo.' }] },
    ...S.history,
    { role:'user', parts: userParts },
  ];
  let raw = '';
  try {
    const r = await fetch(GEMINI_URL, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ contents, generationConfig:{ temperature:0.25, maxOutputTokens:1500, topP:0.8 } }),
    });
    raw = await r.text();
    if (!r.ok) {
      let msg = `Error ${r.status}`;
      try { msg = JSON.parse(raw)?.error?.message || msg; } catch {}
      if (r.status === 400 || r.status === 403) throw new Error('⚠️ Clave Gemini inválida. Verifica en js/app.js línea 3. Obtén clave gratis en aistudio.google.com/app/apikey');
      if (r.status === 429) throw new Error('⚠️ Demasiadas solicitudes. Espere un momento.');
      throw new Error(msg);
    }
    const data = JSON.parse(raw);
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('❌ Gemini no devolvió respuesta. Intente de nuevo.');
    return text;
  } catch(e) {
    if (e.message.startsWith('⚠️') || e.message.startsWith('❌')) throw e;
    if (!raw) throw new Error('❌ Sin conexión a internet.');
    throw new Error('❌ Error: ' + e.message);
  }
}

async function checkGemini() {
  const el = document.getElementById('statusDot');
  try {
    const r = await fetch(GEMINI_URL, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ contents:[{role:'user',parts:[{text:'Di solo: OK'}]}], generationConfig:{maxOutputTokens:5} }),
    });
    el.innerHTML = r.ok
      ? '<span class="dot dot-ok"></span><small>Gemini AI activo ✅</small>'
      : '<span class="dot dot-err"></span><small>Clave inválida ❌ — Verifica js/app.js línea 3</small>';
  } catch { el.innerHTML = '<span class="dot dot-err"></span><small>Sin conexión</small>'; }
}

// ── NAVEGACIÓN ────────────────────────────────────────────────
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('overlay').classList.toggle('show');
}
function showSection(name) {
  document.querySelectorAll('.sec').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(l => l.classList.remove('active'));
  document.querySelectorAll('.bn-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('sec-' + name).classList.add('active');
  const ni = document.querySelector(`[data-s="${name}"]`); if (ni) ni.classList.add('active');
  const bn = document.querySelector(`[data-bn="${name}"]`); if (bn) bn.classList.add('active');
  if (window.innerWidth < 1024 && document.getElementById('sidebar').classList.contains('open')) toggleSidebar();
  if (name === 'favoritos') renderFavs();
  if (name === 'historial') renderHistory();
}

// ── CHAT ──────────────────────────────────────────────────────
function chatKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }
function autoResize(t) { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 120) + 'px'; }

async function sendChat() {
  const ta = document.getElementById('chatTxt');
  const msg = ta.value.trim(); if (!msg) return;
  ta.value = ''; ta.style.height = 'auto';
  userMsg(msg); const td = typingDot(); showLoad('Consultando Gemini AI...');
  try {
    const resp = await gemini(msg);
    S.history.push({ role:'user', parts:[{ text:msg }] });
    S.history.push({ role:'model', parts:[{ text:resp }] });
    if (S.history.length > 20) S.history = S.history.slice(-20);
    td.remove(); botMsg(fmtLegal(resp, msg)); saveQuery(msg, 'CHAT', resp);
  } catch(e) { td.remove(); botMsg(`<div class="proto-alert">${esc(e.message)}</div>`); }
  finally { hideLoad(); }
}
function sendQ(q) { document.getElementById('chatTxt').value = q; sendChat(); }

function userMsg(text) {
  const box = document.getElementById('chatMsgs');
  const d = document.createElement('div'); d.className = 'msg user';
  d.innerHTML = `<div class="msg-av">${S.user[0].toUpperCase()}</div><div class="msg-bub">${esc(text)}</div>`;
  box.appendChild(d); box.scrollTop = box.scrollHeight;
}
function botMsg(html) {
  const box = document.getElementById('chatMsgs');
  const d = document.createElement('div'); d.className = 'msg bot';
  d.innerHTML = `<div class="msg-av">⚖️</div><div class="msg-bub">${html}</div>`;
  box.appendChild(d); box.scrollTop = box.scrollHeight; return d;
}
function typingDot() {
  const box = document.getElementById('chatMsgs');
  const d = document.createElement('div'); d.className = 'msg bot';
  d.innerHTML = `<div class="msg-av">⚖️</div><div class="msg-bub"><div class="typing-dots"><span></span><span></span><span></span></div></div>`;
  box.appendChild(d); box.scrollTop = box.scrollHeight; return d;
}
function fmtLegal(text, query = '') {
  let html = '<div class="legal-resp">';
  text.split('\n').forEach(line => {
    const l = line.trim(); if (!l) return;
    if (/^[🔍📖⚖️📋🚨⚠️🏛️]/.test(l))      html += `<div class="ltitle">${esc(l)}</div>`;
    else if (/^\*\*[🔍📖⚖️📋🚨⚠️🏛️]/.test(l)) html += `<div class="ltitle">${esc(l.replace(/\*\*/g,''))}</div>`;
    else if (/^Art\.?\s*\d+/i.test(l))        html += `<div class="art-box">${esc(l)}</div>`;
    else if (/^[-•*]\s/.test(l))              html += `<div style="padding:.1rem 0 .1rem .9rem">• ${esc(l.replace(/^[-•*]\s*/,''))}</div>`;
    else if (/^\d+\.\s/.test(l))              html += `<div style="padding:.15rem 0">${esc(l)}</div>`;
    else                                       html += `<p>${esc(l)}</p>`;
  });
  if (query) {
    const sn = text.substring(0,100).replace(/\n/g,' ');
    html += `<div style="margin-top:.6rem"><span class="fav-icon" onclick="addFav(${JSON.stringify(esc(query))},${JSON.stringify(esc(sn))})">⭐ Guardar</span></div>`;
  }
  return html + '</div>';
}

// ── BUSCAR LEYES ──────────────────────────────────────────────
async function doSearch() {
  const q = document.getElementById('searchInput').value.trim();
  if (!q) { toast('Ingrese un término','warning'); return; }
  await doSearchTag(q);
}
async function doSearchTag(q) {
  document.getElementById('searchInput').value = q;
  const el = document.getElementById('searchResults');
  el.innerHTML = '<div class="text-center py-4"><div class="spinner-border text-primary"></div></div>';
  showLoad('Buscando en legislación...');
  const prompt = `Busca en legislación salvadoreña: "${q}". Para cada resultado usa EXACTAMENTE:
---R---
DELITO: [nombre]
LEY: [nombre ley]
ARTICULO: [número]
PENA: [pena o sanción]
TEXTO: [texto resumido]
EXPLICACION: [explicación simple para agente de campo]
---FIN---
Da 2-5 resultados. No omitas el formato.`;
  try {
    const resp = await gemini(prompt);
    saveQuery(q, 'BÚSQUEDA', resp);
    const bloques = resp.split('---R---').filter(b => b.includes('DELITO:'));
    if (!bloques.length) { el.innerHTML = `<div class="card-panel">${fmtLegal(resp)}</div>`; return; }
    const get = (b,k) => { const m = b.match(new RegExp(k+':\\s*(.+)')); return m ? m[1].trim() : ''; };
    let html = `<p class="text-muted mb-2"><strong>${bloques.length}</strong> resultado(s) para "<strong>${esc(q)}</strong>"</p>`;
    bloques.forEach(b => {
      const delito=get(b,'DELITO'), art=get(b,'ARTICULO'), ley=get(b,'LEY'), pena=get(b,'PENA'), texto=get(b,'TEXTO'), expl=get(b,'EXPLICACION');
      const sn = `${delito} · ${ley} · ${art}`;
      html += `<div class="result-card">
        <div class="rc-head"><span class="rc-title">${esc(delito)}</span>
        <div style="display:flex;align-items:center;gap:.4rem"><span class="rc-badge">${esc(art)}</span>
        <span class="fav-icon" onclick="addFav(${JSON.stringify(esc(sn))},${JSON.stringify(esc(texto))})">⭐</span></div></div>
        <div class="rc-pena"><i class="bi bi-exclamation-circle me-1"></i>${esc(pena||'Ver artículo')}</div>
        <div class="rc-ley">${esc(ley)}</div>
        <div class="rc-text">${esc(texto)}</div>
        ${expl?`<div class="rc-expl">📝 <strong>Para el agente:</strong> ${esc(expl)}</div>`:''}
      </div>`;
    });
    el.innerHTML = html;
  } catch(e) { el.innerHTML = `<div class="proto-alert">${esc(e.message)}</div>`; }
  finally { hideLoad(); }
}

// ── COMPARAR ──────────────────────────────────────────────────
async function compararLeyes() {
  const a = document.getElementById('compA').value.trim();
  const b = document.getElementById('compB').value.trim();
  if (!a || !b) { toast('Complete ambos campos','warning'); return; }
  showLoad('Comparando con Gemini AI...');
  const prompt = `Compara estas dos leyes/artículos salvadoreños:\n\nA: ${a}\n\nB: ${b}\n\nIncluye: similitudes, diferencias, cuándo aplica cada uno, gravedad comparativa, si se pueden aplicar simultáneamente (concurso) y recomendación práctica para el agente.`;
  try {
    const resp = await gemini(prompt);
    saveQuery(`Comparar: ${a.substring(0,30)} vs ${b.substring(0,30)}`, 'COMPARAR', resp);
    document.getElementById('compareResult').innerHTML = `<div class="card-panel">${fmtLegal(resp)}</div>`;
  } catch(e) { document.getElementById('compareResult').innerHTML = `<div class="proto-alert">${esc(e.message)}</div>`; }
  finally { hideLoad(); }
}

// ── RESUMIR ───────────────────────────────────────────────────
async function resumirLey(tipo) {
  const texto = document.getElementById('textoResumen').value.trim();
  if (!texto) { toast('Ingrese el texto a resumir','warning'); return; }
  const instrucciones = {
    simple:   'Haz un resumen muy claro en máximo 5 oraciones, sin términos técnicos complejos.',
    agente:   'Explica como si hablaras con un agente de campo sin formación legal. ¿Qué debe hacer en la práctica?',
    completo: 'Análisis jurídico completo: objetivo de la norma, elementos del tipo, penas, excepciones y aplicación práctica.',
  };
  showLoad('Resumiendo con Gemini AI...');
  try {
    const resp = await gemini(`Analiza este texto legal salvadoreño:\n\n${texto}\n\n${instrucciones[tipo]}`);
    saveQuery('Resumen: ' + texto.substring(0,50), 'RESUMEN', resp);
    document.getElementById('resumenResult').innerHTML = `<div class="card-panel">${fmtLegal(resp)}</div>`;
  } catch(e) { document.getElementById('resumenResult').innerHTML = `<div class="proto-alert">${esc(e.message)}</div>`; }
  finally { hideLoad(); }
}

// ── CÁMARA ────────────────────────────────────────────────────
function handleDrop(e) { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) processCamFile(f); }
function handleCamFile(e) { const f = e.target.files[0]; if (f) processCamFile(f); }
function processCamFile(file) {
  if (!file.type.startsWith('image/')) { toast('Solo imágenes JPG/PNG','warning'); return; }
  S.camFile = file;
  const r = new FileReader();
  r.onload = ev => {
    document.getElementById('camImg').src = ev.target.result;
    document.getElementById('camZone').style.display = 'none';
    document.getElementById('camPreview').style.display = 'block';
    document.getElementById('camResult').innerHTML = '';
  };
  r.readAsDataURL(file);
}
function resetCam() {
  S.camFile = null;
  document.getElementById('camInput').value = '';
  document.getElementById('camImg').src = '';
  document.getElementById('camZone').style.display = 'block';
  document.getElementById('camPreview').style.display = 'none';
  document.getElementById('camResult').innerHTML = '';
}
async function analizarDocumento() {
  if (!S.camFile) { toast('Seleccione una imagen','warning'); return; }
  showLoad('Analizando con Gemini Vision...');
  try {
    const base64 = await fileToBase64(S.camFile);
    const resp = await gemini(`Analiza este documento legal salvadoreño:
1. ¿Qué tipo de documento es?
2. ¿Qué leyes o artículos menciona?
3. Puntos clave del documento
4. ¿Cuál es su propósito legal?
5. ¿Hay irregularidades o elementos sospechosos?
6. Recomendaciones legales basadas en el contenido`, '', base64, S.camFile.type);
    saveQuery('Documento escaneado', 'CÁMARA', resp);
    document.getElementById('camResult').innerHTML = `<div class="card-panel">${fmtLegal(resp,'Documento escaneado')}</div>`;
  } catch(e) { document.getElementById('camResult').innerHTML = `<div class="proto-alert">${esc(e.message)}</div>`; }
  finally { hideLoad(); }
}
function fileToBase64(f) {
  return new Promise((res,rej) => { const r = new FileReader(); r.onload = ()=>res(r.result.split(',')[1]); r.onerror=rej; r.readAsDataURL(f); });
}

// ── EMERGENCIA ────────────────────────────────────────────────
const PROT = {
  homicidio:  { t:'🚨 Homicidio',          l:'Art.128-131 CP · Art.179-185 CPP',
    p:['Acordone el área mínimo 50 m. Sin civiles.','Llame al 911 y notifique FGR inmediatamente.','NO mueva el cadáver ni ninguna evidencia.','Identifique y separe testigos. Tome sus datos.','Espere al equipo de criminalística PNC.','Elabore croquis preliminar de la escena.','Documente posición, heridas y objetos cercanos.','Informe al juez de paz de turno.'],
    a:'NUNCA mueva el cuerpo ni evidencia. Cualquier alteración nulifica la investigación.' },
  transito:   { t:'🚗 Accidente de Tránsito', l:'Art.145-160 Ley Tránsito · Reglamento VMT',
    p:['Asegure el área con señales de tránsito.','Verifique heridos. Llame al 911 si necesita ambulancia.','Solicite licencia, SOAT y placas de todos los vehículos.','Registre datos de conductores y testigos.','Fotografíe la escena, daños y posición final.','Elabore croquis con medidas exactas.','Prueba de alcoholemia si hay indicios (Art.160).','Levante informe VMT y notifique a FGR si hay muertos.'],
    a:'Si hay muertos o heridos graves, NO mueva vehículos sin autorización fiscal.' },
  violencia:  { t:'💜 Violencia Doméstica',  l:'LEIV Art.1-55 · CP Art.200-204 · CPP',
    p:['Separe a la víctima del agresor inmediatamente.','Evalúe estado físico. Solicite ambulancia si es necesario.','Tome declaración en privado con lenguaje empático.','Fotografíe lesiones visibles (con consentimiento).','Identifique si hay menores. Evalúe su seguridad.','Informe a la víctima sobre medidas cautelares disponibles.','Traslade al agresor si hay flagrancia u orden judicial.','Notifique a FGR y UNIMUJER-PNC de inmediato.'],
    a:'Aplica LEIV. NUNCA minimice ni intente mediar. La víctima toma sus propias decisiones.' },
  flagrancia: { t:'🔒 Captura en Flagrancia', l:'Art.13 Constitución · Art.323-327 CPP',
    p:['Identifíquese como agente antes de actuar.','Informe el motivo exacto de la detención.','Léale los derechos constitucionales al detenido.','Realice cacheo externo en busca de armas.','Espóse con las manos hacia atrás por seguridad.','Incaute evidencia visible. Documente con fotos.','Traslade a la delegación en máximo 6 horas.','Notifique a FGR y elabore informe de captura.'],
    a:'No requiere orden judicial (Art.13 Cn). Notifique FGR en máx. 6 horas o la detención es ilegal.' },
  extorsion:  { t:'📞 Extorsión',             l:'Art.214 CP · Ley Crimen Organizado Art.1-10',
    p:['Tome declaración CONFIDENCIAL de la víctima.','Solicite registros de llamadas, mensajes y evidencia.','Notifique INMEDIATAMENTE a la DAES-PNC.','Informe a la FGR para coordinar investigación.','NO divulgue en ningún momento la identidad de la víctima.','Coordine rastreo de números con FGR y DAES.','Evalúe protección inmediata para la víctima.','Elabore informe clasificado como CONFIDENCIAL.'],
    a:'La identidad de la víctima es CONFIDENCIAL. Filtrar información puede costarle la vida.' },
  drogas:     { t:'💊 Drogas / Narcotráfico', l:'Ley de Drogas · CP Art.33-54',
    p:['Asegure el área y a todos los sospechosos.','Registre a los detenidos con mínimo 2 testigos.','Incaute la droga SIN manipularla directamente (use guantes).','Documente peso estimado y tipo de sustancia visible.','Embale y selle la evidencia con cinta de seguridad.','Elabore acta de incautación con testigos firmantes.','Traslade a laboratorio PNC para análisis químico.','Notifique a FGR y División Antinarcótica (DAN).'],
    a:'Cadena de custodia CRÍTICA. Cualquier ruptura nulifica el proceso. Use siempre guantes.' },
  armas:      { t:'🔫 Armas Ilegales',        l:'Ley de Armas · CP Art.346-347',
    p:['Asegure el área. Verifique que el arma no esté amartillada.','NO toque el arma directamente — use guantes siempre.','Incaute en bolsa de evidencia sellada y etiquetada.','Registre número de serie, calibre y estado del arma.','Elabore acta de incautación con testigos presentes.','Traslade al laboratorio para prueba de idoneidad.','Notifique a FGR e informe a la Unidad de Armas PNC.','Solicite antecedentes del portador al RNPN.'],
    a:'NUNCA apunte ni accione el arma. Trátela siempre como si estuviera cargada.' },
  menor:      { t:'👦 Menor Infractor',        l:'Ley Penal Juvenil · Constitución Art.35',
    p:['Verifique la edad del menor (DUI, partida de nacimiento).','Notifique a los padres o tutores INMEDIATAMENTE.','Traslade a instalaciones para menores (NUNCA a bartolinas de adultos).','Notifique al Juzgado de Menores y a la FGR.','NO interrogue al menor sin presencia de adulto responsable.','Respete la identidad del menor en toda documentación.','Evalúe medidas alternas si el delito es de menor gravedad.','Coordine con PGR si el menor no tiene representante legal.'],
    a:'Menores tienen derechos especiales. Mezclarlos con adultos es violación de ley y Derechos Humanos.' },
};

function protocolo(tipo) {
  const p = PROT[tipo]; const el = document.getElementById('protResult');
  let html = `<div class="proto-card"><div class="proto-head">${p.t}</div>
    <div class="text-muted mb-3" style="font-size:.8rem"><i class="bi bi-book me-1"></i>${p.l}</div>`;
  p.p.forEach((s,i) => html += `<div class="proto-step"><div class="proto-num">${i+1}</div><div class="proto-txt">${esc(s)}</div></div>`);
  html += `<div class="proto-alert"><i class="bi bi-exclamation-triangle-fill me-2"></i>${esc(p.a)}</div>
    <div class="mt-3"><button class="btn btn-sm btn-outline-primary" onclick="ampliarProtocolo('${tipo}')">
    <i class="bi bi-stars me-1"></i>Ampliar con Gemini AI</button></div></div>`;
  el.innerHTML = html; el.scrollIntoView({ behavior:'smooth' });
}
async function ampliarProtocolo(tipo) {
  const p = PROT[tipo]; showLoad('Consultando Gemini AI...');
  try {
    const resp = await gemini(`Protocolo completo para ${p.t.replace(/^[^\w]+/,'')} en El Salvador: artículos exactos, derechos del imputado/víctima, plazos legales, errores comunes y consecuencias por incumplimiento.`);
    const d = document.createElement('div'); d.className = 'card-panel mt-3';
    d.innerHTML = fmtLegal(resp);
    document.getElementById('protResult').appendChild(d);
  } catch(e) { toast(e.message,'danger'); } finally { hideLoad(); }
}

// ── INFORMES ──────────────────────────────────────────────────
async function genInforme() {
  const tipo=document.getElementById('infoTipo').value, exp=document.getElementById('infoExp').value.trim(),
        agente=document.getElementById('infoAgente').value.trim(), unidad=document.getElementById('infoUnidad').value.trim(),
        hecho=document.getElementById('infoHecho').value.trim();
  if (!hecho) { toast('Describa el hecho','warning'); return; }
  const fecha = new Date().toLocaleString('es-SV',{timeZone:'America/El_Salvador'});
  const prompt = `Redacta un ${tipo} oficial de El Salvador:\nExpediente: ${exp||'Por asignar'}\nAgente: ${agente||'No especificado'}\nUnidad: ${unidad||'No especificada'}\nFecha: ${fecha}\nHecho: ${hecho}\nUsa lenguaje oficial, cita artículos, incluye hechos, actuaciones, observaciones y firma.`;
  showLoad('Generando documento...');
  try {
    const resp = await gemini(prompt);
    saveQuery(`${tipo}: ${hecho.substring(0,50)}`, 'INFORME', resp);
    const el = document.getElementById('infoResult');
    el.innerHTML = `<div class="card-panel">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h6 class="mb-0 fw-bold"><i class="bi bi-file-earmark-check me-2 text-success"></i>Documento generado</h6>
        <button class="btn btn-sm btn-outline-secondary" onclick="exportPDF()"><i class="bi bi-file-earmark-pdf me-1"></i>PDF</button>
      </div>
      <div class="informe-prev" id="infoContent">
        <div class="inf-head"><h3>REPÚBLICA DE EL SALVADOR</h3><h3>${esc(unidad||'POLICÍA NACIONAL CIVIL')}</h3><h3>${esc(tipo.toUpperCase())}</h3><p>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</p></div>
        <div class="inf-field"><strong>N° Expediente:</strong> ${esc(exp||'Por asignar')}</div>
        <div class="inf-field"><strong>Fecha/Hora:</strong> ${fecha}</div>
        <div class="inf-field"><strong>Agente:</strong> ${esc(agente||'No especificado')}</div>
        <div class="inf-div"></div>
        <div class="inf-body">${esc(resp)}</div>
        <div class="inf-firma"><p>────────────────────────</p><p>${esc(agente||'Firma del Agente')}</p><p>${esc(unidad||'')}</p><p>Fecha: ${fecha}</p></div>
      </div></div>`;
    el.scrollIntoView({behavior:'smooth'});
    document.getElementById('btnPDF').style.display = 'inline-flex';
  } catch(e) { toast(e.message,'danger'); } finally { hideLoad(); }
}
function exportPDF() {
  const c = document.getElementById('infoContent'); if (!c) return;
  const w = window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Informe LexSV AI</title>
  <style>body{font-family:'Courier New',monospace;padding:2cm;font-size:11pt}h3{text-align:center;text-transform:uppercase}
  .inf-div{border-top:1px solid #000;margin:.8rem 0}.inf-firma{margin-top:2rem;text-align:right}@media print{body{margin:0}}</style></head>
  <body>${c.innerHTML}</body></html>`);
  w.document.close(); setTimeout(()=>w.print(),500);
}

// ── FAVORITOS ─────────────────────────────────────────────────
function loadFavs() { try { S.favs = JSON.parse(localStorage.getItem('lx_favs')||'[]'); } catch { S.favs=[]; } }
function saveFavs() { localStorage.setItem('lx_favs', JSON.stringify(S.favs)); }
function addFav(titulo, resumen) {
  const t = titulo.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
  S.favs.unshift({ id:Date.now(), titulo:t, resumen, fecha:new Date().toLocaleDateString('es-SV') });
  if (S.favs.length > 50) S.favs = S.favs.slice(0,50);
  saveFavs(); toast('⭐ Guardado en favoritos','success');
}
function removeFav(id) { S.favs = S.favs.filter(f=>f.id!==id); saveFavs(); renderFavs(); }
function renderFavs() {
  const el = document.getElementById('favList'), em = document.getElementById('favEmpty');
  if (!S.favs.length) { el.innerHTML=''; em.style.display='block'; return; }
  em.style.display = 'none';
  el.innerHTML = S.favs.map(f=>`
    <div class="fav-item">
      <div class="fav-item-body" onclick="sendQ(${JSON.stringify(f.titulo)});showSection('chat')">
        <div class="fav-item-title">${esc(f.titulo)}</div>
        <div class="fav-item-meta">${esc(f.resumen.substring(0,80))}... · ${f.fecha}</div>
      </div>
      <button class="fav-del" onclick="removeFav(${f.id})"><i class="bi bi-trash"></i></button>
    </div>`).join('');
}

// ── HISTORIAL ─────────────────────────────────────────────────
function loadQueries() { try { S.queries = JSON.parse(localStorage.getItem('lx_hist')||'[]'); } catch { S.queries=[]; } }
function saveQuery(q, tipo, resp) {
  S.queries.unshift({ id:Date.now(), q, tipo, resp:resp.substring(0,300), ts:new Date().toLocaleString('es-SV') });
  if (S.queries.length > 50) S.queries = S.queries.slice(0,50);
  localStorage.setItem('lx_hist', JSON.stringify(S.queries));
}
function renderHistory() {
  const el=document.getElementById('histList'), em=document.getElementById('histEmpty');
  if (!S.queries.length) { el.innerHTML=''; em.style.display='block'; return; }
  em.style.display='none';
  const col = {CHAT:['#003087','#e8f0ff'],BÚSQUEDA:['#1a7a4a','#e8f5ee'],COMPARAR:['#D4860B','#fff5e8'],RESUMEN:['#6f42c1','#f3eeff'],CÁMARA:['#0d6efd','#e8f0ff'],INFORME:['#6c757d','#f5f5f5'],EMERGENCIA:['#C0392B','#fff0f0']};
  el.innerHTML = S.queries.map(q=>{
    const [fg,bg] = col[q.tipo]||['#003087','#e8f0ff'];
    return `<div class="hist-item" onclick="sendQ(${JSON.stringify(q.q)});showSection('chat')">
      <div class="hist-q">${esc(q.q)}</div>
      <div class="hist-meta">
        <span class="hist-type" style="background:${bg};color:${fg}">${q.tipo}</span>
        <span>${q.ts}</span>
      </div>
    </div>`;
  }).join('');
}
function clearHistory() {
  if (!confirm('¿Limpiar todo el historial?')) return;
  S.queries=[]; localStorage.removeItem('lx_hist'); renderHistory(); toast('Historial limpiado','info');
}

// ── OFFLINE LEYES ─────────────────────────────────────────────
const OFFLINE_LEYES = [
  { t:'⚖️ Código Penal – Delitos más comunes', arts:[
    {n:'Art.128 – Homicidio simple',t:'Prisión de 10 a 20 años.'},
    {n:'Art.129 – Homicidio agravado',t:'Prisión de 20 a 30 años. Aplica en parentesco, alevosía, precio, funcionario.'},
    {n:'Art.207 – Robo',t:'Apoderamiento con violencia o intimidación. Prisión de 6 a 10 años.'},
    {n:'Art.208 – Hurto',t:'Apoderamiento sin violencia. Prisión de 2 a 5 años.'},
    {n:'Art.214 – Extorsión',t:'Obligar a otro mediante amenaza a un acto. Prisión de 6 a 15 años.'},
    {n:'Art.346 – Portación ilegal de armas',t:'Portar arma sin licencia. Prisión de 3 a 6 años.'},
  ]},
  {t:'🛡️ Derechos del Detenido', arts:[
    {n:'Art.12 Constitución',t:'Presunción de inocencia hasta prueba en contrario.'},
    {n:'Art.13 Constitución',t:'Detención solo con orden judicial. Flagrancia: puede detener cualquier persona.'},
    {n:'Derecho al silencio',t:'Nadie puede ser obligado a declarar contra sí mismo.'},
    {n:'Derecho a defensa',t:'Asistencia de abogado desde el momento de la detención.'},
    {n:'Notificación familiar',t:'Informar a familiar o persona de confianza dentro de 6 horas.'},
    {n:'Plazo ante juez',t:'El detenido debe presentarse ante juez dentro de 72 horas.'},
  ]},
  {t:'🚗 Ley de Tránsito – Principales infracciones', arts:[
    {n:'Art.145 – Conducción peligrosa',t:'Exceso de velocidad, ebriedad, ignorar señales. Multa y suspensión.'},
    {n:'Art.147 – Accidente con daños',t:'Obligación de auxiliar heridos, dar datos y reportar.'},
    {n:'Art.149 – Sin licencia',t:'Multa y retención del vehículo.'},
    {n:'Art.160 – Alcoholemia',t:'0.5 g/l o más: multa, suspensión y posible arresto.'},
    {n:'Art.155 – Semáforo en rojo',t:'Infracción grave. Multa establecida en tabla VMT.'},
  ]},
  {t:'🔒 Captura en Flagrancia – CPP', arts:[
    {n:'Art.323 CPP – Definición',t:'Delito flagrante: sorprendido cometiendo el delito o inmediatamente después.'},
    {n:'Art.324 CPP – Facultad',t:'Cualquier persona puede detener en flagrancia. Debe entregar a la PNC.'},
    {n:'Art.325 CPP – Plazo',t:'Máximo 6 horas de detención administrativa.'},
    {n:'Obligación PNC',t:'Informe de captura debe elaborarse dentro de 24 horas.'},
  ]},
  {t:'💜 LEIV – Violencia contra la Mujer', arts:[
    {n:'Art.9 – Violencia económica',t:'Control de bienes o recursos económicos de la mujer.'},
    {n:'Art.10 – Violencia feminicida',t:'Riesgo a la vida de la mujer. Prisión de 20 a 35 años.'},
    {n:'Art.51 – Medidas cautelares',t:'Alejamiento del agresor, prohibición de acercamiento y comunicación.'},
    {n:'Art.56 – Obligación de autoridades',t:'Deben activar protocolos especializados de atención a víctimas.'},
  ]},
  {t:'💊 Ley de Drogas – Artículos clave', arts:[
    {n:'Art.33 – Tráfico',t:'Transporte, distribución o venta. Prisión de 8 a 15 años.'},
    {n:'Art.34 – Posesión',t:'Posesión para consumo personal. Medidas de seguridad o rehabilitación.'},
    {n:'Art.36 – Siembra',t:'Cultivo de plantas para producción. Prisión de 6 a 10 años.'},
    {n:'Art.52 – Encubrimiento',t:'Ocultar o ayudar a traficantes. Prisión de 2 a 5 años.'},
  ]},
];

function buildOffline() {
  document.getElementById('offlineGrid').innerHTML = OFFLINE_LEYES.map((ley,i)=>`
    <div class="off-card">
      <div class="off-head" onclick="toggleOff(${i})">
        <div class="off-title">${esc(ley.t)}</div>
        <div style="display:flex;align-items:center;gap:.5rem">
          <span class="off-badge">OFFLINE</span>
          <i class="bi bi-chevron-down off-chev" id="chev${i}"></i>
        </div>
      </div>
      <div class="off-body" id="off${i}">
        ${ley.arts.map(a=>`<div class="off-art"><strong>${esc(a.n)}</strong>${esc(a.t)}</div>`).join('')}
      </div>
    </div>`).join('');
}
function toggleOff(i) {
  const b=document.getElementById('off'+i), c=document.getElementById('chev'+i);
  const open = b.classList.toggle('open');
  c.style.transform = open ? 'rotate(180deg)' : '';
}

// ── VOZ ───────────────────────────────────────────────────────
function startVoiceGlobal() { showSection('chat'); toggleVoiceChat(); }
function toggleVoiceChat() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { toast('Voz no disponible en este navegador','warning'); return; }
  if (S.voiceOn) { S.recog?.stop(); stopVoice(); return; }
  const r = new SR(); r.lang='es-SV'; r.continuous=false; r.interimResults=false; S.recog=r;
  r.onresult = e => { document.getElementById('chatTxt').value = e.results[0][0].transcript; sendChat(); };
  r.onerror = () => { toast('Error de voz','danger'); stopVoice(); };
  r.onend = stopVoice; r.start(); S.voiceOn=true;
  document.getElementById('voiceChatBtn')?.classList.add('active-voice');
  document.getElementById('voiceGlobalBtn')?.classList.add('active-voice');
  toast('🎤 Escuchando... hable ahora','info');
}
function stopVoice() {
  S.voiceOn=false;
  document.getElementById('voiceChatBtn')?.classList.remove('active-voice');
  document.getElementById('voiceGlobalBtn')?.classList.remove('active-voice');
}

// ── UTILIDADES ────────────────────────────────────────────────
function showLoad(t='Procesando...') { document.getElementById('loadTxt').textContent=t; document.getElementById('loadingOv').style.display='flex'; }
function hideLoad() { document.getElementById('loadingOv').style.display='none'; }
function toast(msg, type='primary') {
  const m={primary:'text-bg-primary',warning:'text-bg-warning',danger:'text-bg-danger',info:'text-bg-info',success:'text-bg-success'};
  const t=document.getElementById('appToast');
  t.className=`toast align-items-center border-0 ${m[type]||m.primary}`;
  document.getElementById('toastMsg').textContent=msg;
  new bootstrap.Toast(t,{delay:3000}).show();
}
function esc(t) { if(!t)return''; return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function registerSW() { if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{}); }
document.addEventListener('keydown', e => {
  if (e.key==='Escape' && document.getElementById('sidebar')?.classList.contains('open')) toggleSidebar();
});

// ══ PWA INSTALL BANNER ═══════════════════════════════════════
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  // Mostrar banner solo si no está instalada
  if (!window.matchMedia('(display-mode: standalone)').matches) {
    setTimeout(() => {
      const b = document.getElementById('installBanner');
      if (b) b.style.display = 'flex';
    }, 4000);
  }
});

async function installPWA() {
  const b = document.getElementById('installBanner');
  if (b) b.style.display = 'none';
  if (!deferredPrompt) { toast('Use el menú del navegador para instalar', 'info'); return; }
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  if (outcome === 'accepted') toast('✅ LexSV AI instalada correctamente', 'success');
  deferredPrompt = null;
}

window.addEventListener('appinstalled', () => {
  toast('✅ App instalada. Búsquela en su pantalla de inicio.', 'success');
  deferredPrompt = null;
});
