/* ============================================================
   LexSV AI v3.0 – app.js
   Motor: Google Gemini 2.0 Flash
   Funcionalidades: Chat, Buscar, Comparar, Resumir, Cámara,
   Emergencia, Informes, Favoritos, Historial, Offline, Voz
   ============================================================ */
'use strict';

// ══ ⚙️  CONFIGURACIÓN ═══════════════════════════════════════
// La clave de Gemini YA NO va aquí. Vive protegida en el servidor
// (application.properties) y este archivo llama al endpoint Spring Boot
// POST /api/gemini (ver GeminiController.java). Así la clave nunca
// queda visible en el navegador del usuario.
// ═════════════════════════════════════════════════════════════

const GEMINI_URL = 'api/gemini';

const SYSTEM = `Eres LexSV AI, asistente jurídico especializado EXCLUSIVAMENTE en legislación vigente de la República de El Salvador. Apoyas a policías, fiscales, jueces, abogados, agentes de tránsito y estudiantes de derecho.

LEGISLACIÓN QUE CONOCES:
- Constitución de la República de El Salvador (1983 y reformas)
- Código Penal y sus reformas
- Código Procesal Penal (CPP)
- Ley de Tránsito y Reglamento
- Ley Penal Juvenil
- LEIV (Ley Especial Integral para una Vida Libre de Violencia)
- Ley contra el Crimen Organizado
- Ley Especial contra Actos de Terrorismo
- Ley de Proscripción de Maras y Pandillas
- Ley Reguladora de Actividades Relativas a las Drogas
- Ley de Armas, Municiones y Explosivos
- Reglamentos PNC y protocolos operativos

FORMATO DE RESPUESTA (úsalo siempre):
🔍 POSIBLE DELITO(S): [nombre]
📖 ARTÍCULOS APLICABLES: [Art. X, Ley Y]
⚖️ GRAVEDAD: [Baja/Media/Alta/Muy Alta]
📋 PROCEDIMIENTO: [pasos numerados]
🚨 DERECHOS DEL DETENIDO: [listar cuando aplique]
⚠️ ADVERTENCIAS: [riesgos legales]
🏛️ INSTITUCIÓN COMPETENTE: [PNC/FGR/CSJ]

Sé claro, conciso y profesional. Cita artículos exactos.`;

// ══ ESTADO ═══════════════════════════════════════════════════
const S = {
  user:    localStorage.getItem('lx_user') || 'Agente',
  role:    localStorage.getItem('lx_role') || 'PNC',
  history: [],          // historial de chat Gemini [{role,parts}]
  queries: [],          // historial de consultas guardadas
  favs:    [],          // favoritos guardados
  camFile: null,        // archivo de cámara
  recog:   null,        // reconocimiento de voz
  voiceOn: false,
};

// ══ INIT ══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  // Splash 2.5 s
  setTimeout(() => {
    document.getElementById('splashScreen').classList.add('hidden');
    if (localStorage.getItem('lx_user')) showApp();
    else document.getElementById('loginScreen').classList.add('active');
  }, 2500);

  loadFavs();
  loadQueries();
  buildOffline();
  registerSW();
});

// ══ AUTH ══════════════════════════════════════════════════════
function doLogin() {
  const u = document.getElementById('loginUser').value.trim() || 'Agente';
  const r = document.getElementById('loginRole').value;
  S.user = u; S.role = r;
  localStorage.setItem('lx_user', u);
  localStorage.setItem('lx_role', r);
  document.getElementById('loginScreen').classList.remove('active');
  showApp();
}

function showApp() {
  document.getElementById('appScreen').classList.add('active');
  document.getElementById('profileName').textContent = S.user;
  document.getElementById('profileRole').textContent = S.role;
  document.getElementById('profileAvatar').textContent = S.user[0].toUpperCase();
  botMsg(`¡Bienvenido, <strong>${S.user}</strong>! Soy LexSV AI. ¿En qué le puedo asistir hoy?`);
  checkGemini();
}

function doLogout() {
  ['lx_user','lx_role'].forEach(k => localStorage.removeItem(k));
  location.reload();
}

// ══ GEMINI API ════════════════════════════════════════════════
async function gemini(userText, extraSystem = '', imageBase64 = null, imageMime = null) {
  // Construir parts del mensaje actual
  const userParts = [];
  if (imageBase64 && imageMime) {
    userParts.push({ inline_data: { mime_type: imageMime, data: imageBase64 } });
  }
  userParts.push({ text: userText });

  // Contenidos: sistema como primer turno + historial + mensaje actual
  const contents = [
    { role: 'user',  parts: [{ text: 'Eres LexSV AI. ' + SYSTEM + (extraSystem ? '\n\n' + extraSystem : '') + '\n\nConfirma tu rol.' }] },
    { role: 'model', parts: [{ text: 'Entendido. Soy LexSV AI, asistente jurídico especializado en legislación salvadoreña. Listo para asistir.' }] },
    ...S.history,
    { role: 'user', parts: userParts },
  ];

  let rawText = '';
  try {
    const resp = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: { temperature: 0.25, maxOutputTokens: 1500, topP: 0.8 },
      }),
    });
    rawText = await resp.text();
    if (!resp.ok) {
      let msg = `Error ${resp.status}`;
      try { msg = JSON.parse(rawText)?.error?.message || msg; } catch {}
      if (resp.status === 500 || resp.status === 400 || resp.status === 403) throw new Error('⚠️ ' + msg + ' (revise application.properties en el servidor)');
      if (resp.status === 429) throw new Error('⚠️ Límite de solicitudes alcanzado. Espere un momento.');
      if (resp.status === 502) throw new Error('⚠️ El servidor no pudo contactar a Gemini. Verifique la conexión a internet del servidor.');
      throw new Error(msg);
    }
    const data = JSON.parse(rawText);
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('❌ Gemini no devolvió respuesta. Intente de nuevo.');
    return text;
  } catch(e) {
    if (e.message.startsWith('⚠️') || e.message.startsWith('❌')) throw e;
    if (!rawText) throw new Error('❌ Sin conexión a internet.');
    throw new Error('❌ Error procesando respuesta. Intente de nuevo.');
  }
}

async function checkGemini() {
  const el = document.getElementById('statusDot');
  // Evita gastar cuota del plan gratis: si ya se revisó hace menos de 5 min, reutiliza el resultado
  const cached = sessionStorage.getItem('lx_gemini_status');
  const cachedAt = Number(sessionStorage.getItem('lx_gemini_status_ts') || 0);
  if (cached && (Date.now() - cachedAt) < 5 * 60 * 1000) {
    el.innerHTML = cached;
    return;
  }
  try {
    const r = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role:'user', parts:[{ text:'Responde solo: OK' }] }],
        generationConfig: { maxOutputTokens: 5 }
      }),
    });
    const html = r.ok
      ? '<span class="dot dot-ok"></span><small>Gemini AI activo ✅</small>'
      : '<span class="dot dot-err"></span><small>Clave Gemini inválida ❌</small>';
    el.innerHTML = html;
    sessionStorage.setItem('lx_gemini_status', html);
    sessionStorage.setItem('lx_gemini_status_ts', String(Date.now()));
  } catch {
    el.innerHTML = '<span class="dot dot-err"></span><small>Sin conexión</small>';
  }
}

// ══ NAVEGACIÓN ════════════════════════════════════════════════
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('overlay').classList.toggle('show');
}

function showSection(name) {
  document.querySelectorAll('.sec').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(l => l.classList.remove('active'));
  document.querySelectorAll('.bn-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('sec-' + name).classList.add('active');
  const ni = document.querySelector(`[data-s="${name}"]`);
  if (ni) ni.classList.add('active');
  const bn = document.querySelector(`[data-bn="${name}"]`);
  if (bn) bn.classList.add('active');
  if (window.innerWidth < 1024 && document.getElementById('sidebar').classList.contains('open')) toggleSidebar();
  // Cargar contenido dinámico
  if (name === 'favoritos') renderFavs();
  if (name === 'historial') renderHistory();
}

// ══ CHAT ══════════════════════════════════════════════════════
function chatKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }
function autoResize(t) { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 120) + 'px'; }

async function sendChat() {
  const ta = document.getElementById('chatTxt');
  const msg = ta.value.trim();
  if (!msg) return;
  ta.value = ''; ta.style.height = 'auto';
  userMsg(msg);
  const td = typingDot();
  showLoad('Consultando Gemini AI...');
  try {
    const resp = await gemini(msg);
    // Actualizar historial de chat
    S.history.push({ role:'user', parts:[{ text: msg }] });
    S.history.push({ role:'model', parts:[{ text: resp }] });
    if (S.history.length > 20) S.history = S.history.slice(-20); // max 10 turnos
    td.remove();
    botMsg(fmtLegal(resp, msg));
    saveQuery(msg, 'CHAT', resp);
  } catch(e) {
    td.remove();
    botMsg(`<div class="proto-alert">${esc(e.message)}</div>`);
  } finally { hideLoad(); }
}

function sendQ(q) { document.getElementById('chatTxt').value = q; sendChat(); }

function userMsg(text) {
  const box = document.getElementById('chatMsgs');
  const d = document.createElement('div');
  d.className = 'msg user';
  d.innerHTML = `<div class="msg-av">${S.user[0].toUpperCase()}</div><div class="msg-bub">${esc(text)}</div>`;
  box.appendChild(d); box.scrollTop = box.scrollHeight;
}

function botMsg(html) {
  const box = document.getElementById('chatMsgs');
  const d = document.createElement('div');
  d.className = 'msg bot';
  d.innerHTML = `<div class="msg-av">⚖️</div><div class="msg-bub">${html}</div>`;
  box.appendChild(d); box.scrollTop = box.scrollHeight;
  return d;
}

function typingDot() {
  const box = document.getElementById('chatMsgs');
  const d = document.createElement('div');
  d.className = 'msg bot';
  d.innerHTML = `<div class="msg-av">⚖️</div><div class="msg-bub"><div class="typing-dots"><span></span><span></span><span></span></div></div>`;
  box.appendChild(d); box.scrollTop = box.scrollHeight;
  return d;
}

// ══ FORMATO LEGAL ══════════════════════════════════════════════
function fmtLegal(text, query = '') {
  let html = '<div class="legal-resp">';
  text.split('\n').forEach(line => {
    const l = line.trim();
    if (!l) return;
    if (/^[🔍📖⚖️📋🚨⚠️🏛️]/.test(l) || /^\*\*[🔍📖⚖️📋🚨⚠️🏛️]/.test(l)) {
      html += `<div class="ltitle">${esc(l.replace(/\*\*/g,''))}</div>`;
    } else if (/^Art\.?\s*\d+/i.test(l) || /^Artículo\s*\d+/i.test(l)) {
      html += `<div class="art-box">${esc(l)}</div>`;
    } else if (/^[-•*]\s/.test(l)) {
      html += `<div style="padding:.1rem 0 .1rem .9rem">• ${esc(l.replace(/^[-•*]\s*/,''))}</div>`;
    } else if (/^\d+\.\s/.test(l)) {
      html += `<div style="padding:.15rem 0">${esc(l)}</div>`;
    } else {
      html += `<p>${esc(l)}</p>`;
    }
  });
  // Botón guardar en favoritos
  if (query) {
    const snippet = text.substring(0, 120).replace(/\n/g,' ');
    html += `<div style="margin-top:.6rem;text-align:right">
      <span class="fav-icon" title="Guardar en favoritos" onclick="addFav(${JSON.stringify(esc(query))}, ${JSON.stringify(esc(snippet))})">⭐ Guardar</span>
    </div>`;
  }
  html += '</div>';
  return html;
}

// ══ BÚSQUEDA DE LEYES ════════════════════════════════════════
async function doSearch() {
  const q = document.getElementById('searchInput').value.trim();
  if (!q) { toast('Ingrese un término de búsqueda', 'warning'); return; }
  await doSearchTag(q);
}

async function doSearchTag(q) {
  document.getElementById('searchInput').value = q;
  const el = document.getElementById('searchResults');
  el.innerHTML = '<div class="text-center py-3"><div class="spinner-border text-primary"></div></div>';
  showLoad('Buscando en legislación...');
  const prompt = `Busca en la legislación salvadoreña sobre: "${q}". Para cada resultado usa EXACTAMENTE este formato:
---R---
DELITO: [nombre del delito o figura legal]
LEY: [nombre exacto de la ley]
ARTICULO: [número de artículo]
PENA: [pena o sanción]
TEXTO: [texto resumido del artículo]
EXPLICACION: [explicación simple para un agente de campo]
---FIN---
Da entre 2 y 5 resultados relevantes. No omitas el formato.`;
  try {
    const resp = await gemini(prompt, '', null, null);
    saveQuery(q, 'BÚSQUEDA', resp);
    const bloques = resp.split('---R---').filter(b => b.includes('DELITO:'));
    if (!bloques.length) { el.innerHTML = `<div class="card-panel">${fmtLegal(resp)}</div>`; return; }
    const get = (b, k) => { const m = b.match(new RegExp(k + ':\\s*(.+)')); return m ? m[1].trim() : ''; };
    let html = `<p class="text-muted mb-2">${bloques.length} resultado(s) para "<strong>${esc(q)}</strong>"</p>`;
    bloques.forEach(b => {
      const delito = get(b,'DELITO'); const art = get(b,'ARTICULO'); const ley = get(b,'LEY');
      const pena = get(b,'PENA'); const texto = get(b,'TEXTO'); const expl = get(b,'EXPLICACION');
      const snippet = `${delito} · ${ley} · ${art}`;
      html += `<div class="result-card">
        <div class="rc-head">
          <span class="rc-title">${esc(delito)}</span>
          <div style="display:flex;align-items:center;gap:.4rem">
            <span class="rc-badge">${esc(art)}</span>
            <span class="fav-icon" title="Guardar" onclick="addFav(${JSON.stringify(esc(snippet))}, ${JSON.stringify(esc(texto))})">⭐</span>
          </div>
        </div>
        <div class="rc-pena"><i class="bi bi-exclamation-circle me-1"></i>${esc(pena||'Ver artículo')}</div>
        <div class="rc-ley">${esc(ley)}</div>
        <div class="rc-text">${esc(texto)}</div>
        ${expl ? `<div class="rc-expl">📝 <strong>Para el agente:</strong> ${esc(expl)}</div>` : ''}
      </div>`;
    });
    el.innerHTML = html;
  } catch(e) {
    el.innerHTML = `<div class="proto-alert">${esc(e.message)}</div>`;
  } finally { hideLoad(); }
}

// ══ COMPARAR LEYES ═══════════════════════════════════════════
async function compararLeyes() {
  const a = document.getElementById('compA').value.trim();
  const b = document.getElementById('compB').value.trim();
  if (!a || !b) { toast('Complete ambos campos para comparar', 'warning'); return; }
  showLoad('Comparando con Gemini AI...');
  const prompt = `Compara estas dos leyes/artículos de El Salvador de forma detallada:

LEY/ARTÍCULO A:
${a}

LEY/ARTÍCULO B:
${b}

Proporciona:
1. ¿En qué se parecen?
2. ¿En qué se diferencian?
3. ¿Cuándo aplica cada uno?
4. Gravedad comparativa
5. ¿Se pueden aplicar simultáneamente (concurso de delitos)?
6. Recomendación práctica para el agente`;
  try {
    const resp = await gemini(prompt);
    saveQuery(`Comparar: ${a.substring(0,40)} vs ${b.substring(0,40)}`, 'COMPARAR', resp);
    document.getElementById('compareResult').innerHTML = `<div class="card-panel">${fmtLegal(resp)}</div>`;
  } catch(e) {
    document.getElementById('compareResult').innerHTML = `<div class="proto-alert">${esc(e.message)}</div>`;
  } finally { hideLoad(); }
}

// ══ RESUMIR LEY ═══════════════════════════════════════════════
async function resumirLey(tipo) {
  const texto = document.getElementById('textoResumen').value.trim();
  if (!texto) { toast('Ingrese el texto legal a resumir', 'warning'); return; }
  const instrucciones = {
    simple:   'Haz un resumen muy claro y sencillo en máximo 5 oraciones, sin términos técnicos.',
    agente:   'Explica este texto como si hablaras con un agente de campo sin formación legal. Indica qué debe hacer en la práctica.',
    completo: 'Haz un análisis jurídico completo: objetivo de la norma, elementos del tipo (si es delito), penas, excepciones, jurisprudencia relevante y aplicación práctica.',
  };
  showLoad('Resumiendo con Gemini AI...');
  const prompt = `Analiza este texto legal salvadoreño:\n\n${texto}\n\n${instrucciones[tipo]}`;
  try {
    const resp = await gemini(prompt);
    saveQuery('Resumen: ' + texto.substring(0,50), 'RESUMEN', resp);
    document.getElementById('resumenResult').innerHTML = `<div class="card-panel">${fmtLegal(resp)}</div>`;
  } catch(e) {
    document.getElementById('resumenResult').innerHTML = `<div class="proto-alert">${esc(e.message)}</div>`;
  } finally { hideLoad(); }
}

// ══ CÁMARA / ESCANEAR DOCUMENTO ═══════════════════════════════
function handleDrop(e) {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (file) processCamFile(file);
}

function handleCamFile(e) {
  const file = e.target.files[0];
  if (file) processCamFile(file);
}

function processCamFile(file) {
  if (!file.type.startsWith('image/')) { toast('Solo se aceptan imágenes', 'warning'); return; }
  S.camFile = file;
  const reader = new FileReader();
  reader.onload = ev => {
    document.getElementById('camImg').src = ev.target.result;
    document.getElementById('camZone').style.display = 'none';
    document.getElementById('camPreview').style.display = 'block';
  };
  reader.readAsDataURL(file);
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
  if (!S.camFile) { toast('Seleccione una imagen primero', 'warning'); return; }
  showLoad('Analizando documento con Gemini Vision...');
  try {
    const base64 = await fileToBase64(S.camFile);
    const mime = S.camFile.type;
    const prompt = `Analiza esta imagen de un documento legal salvadoreño. Extrae y explica:
1. ¿Qué tipo de documento es?
2. ¿Qué leyes o artículos menciona?
3. Puntos clave del documento
4. Si es un acta, informe o resolución: ¿cuál es su propósito?
5. ¿Hay elementos sospechosos o irregularidades visibles?
6. Recomendaciones legales basadas en el contenido`;
    const resp = await gemini(prompt, '', base64, mime);
    saveQuery('Documento escaneado', 'CÁMARA', resp);
    document.getElementById('camResult').innerHTML = `<div class="card-panel">${fmtLegal(resp, 'Documento escaneado')}</div>`;
  } catch(e) {
    document.getElementById('camResult').innerHTML = `<div class="proto-alert">${esc(e.message)}</div>`;
  } finally { hideLoad(); }
}

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// ══ MODO EMERGENCIA ═══════════════════════════════════════════
const PROT = {
  homicidio:  { t:'🚨 Homicidio',          l:'Art.128-131 CP · Art.179-185 CPP',
    p:['Acorde el área mínimo 50 m. Sin civiles.','Llame al 911 y notifique FGR inmediatamente.','NO mueva el cadáver ni ninguna evidencia.','Identifique y separe a testigos.','Espere al equipo de criminalística.','Elabore croquis preliminar.','Documente posición, heridas y objetos cercanos.','Informe al juez de paz de turno.'],
    a:'NUNCA mueva el cuerpo ni la evidencia. Cualquier alteración nulifica la investigación.' },
  transito:   { t:'🚗 Accidente de Tránsito', l:'Art.145-160 Ley Tránsito',
    p:['Asegure el área con señales.','Verifique heridos y llame al 911.','Solicite licencia, SOAT y placas.','Registre datos de conductores y testigos.','Fotografíe escena y daños.','Elabore croquis con medidas.','Prueba de alcoholemia si hay indicios.','Levante informe VMT.'],
    a:'Si hay muertos o heridos graves, NO mueva los vehículos sin autorización fiscal.' },
  violencia:  { t:'💜 Violencia Doméstica',   l:'LEIV · CP Art.200-204 · CPP',
    p:['Separe a la víctima del agresor de inmediato.','Evalúe estado físico. Solicite ambulancia si es necesario.','Tome declaración en privado con lenguaje empático.','Fotografíe lesiones (con consentimiento).','Identifique si hay menores y evalúe su seguridad.','Informe a la víctima sobre medidas cautelares.','Traslade al agresor si hay flagrancia u orden judicial.','Notifique a FGR y UNIMUJER-PNC.'],
    a:'Aplica LEIV. No minimice ni intente mediar. La víctima toma sus propias decisiones.' },
  flagrancia: { t:'🔒 Captura en Flagrancia',  l:'Art.13 Constitución · Art.323-327 CPP',
    p:['Identifíquese como agente antes de actuar.','Informe el motivo de la detención.','Léale los derechos constitucionales.','Realice cacheo externo en busca de armas.','Espóse al detenido por seguridad.','Incaute evidencia visible. Documente con fotos.','Traslade a la delegación en máx. 6 horas.','Notifique a la FGR y elabore informe de captura.'],
    a:'No requiere orden judicial (Art.13 Cn). Notifique FGR en máx. 6 horas o la detención es ilegal.' },
  extorsion:  { t:'📞 Extorsión',              l:'Art.214 CP · Ley Crimen Organizado',
    p:['Tome declaración CONFIDENCIAL de la víctima.','Solicite registros de llamadas, mensajes y evidencia.','Notifique INMEDIATAMENTE a DAES-PNC.','Informe a la FGR para coordinar investigación.','NO divulgue la identidad de la víctima.','Coordine rastreo de números con FGR.','Evalúe protección inmediata para la víctima.','Elabore informe confidencial.'],
    a:'La identidad de la víctima es CONFIDENCIAL. Filtrar información puede costarle la vida.' },
  drogas:     { t:'💊 Drogas / Narcotráfico',  l:'Ley de Drogas · CP Art.33-54',
    p:['Asegure el área y a los sospechosos.','Registre con al menos 2 testigos presentes.','Incaute SIN manipular directamente (use guantes).','Documente peso y tipo de sustancia visible.','Embale y selle con cinta de seguridad.','Elabore acta de incautación con testigos.','Traslade a laboratorio PNC para análisis.','Notifique a FGR y División Antinarcótica (DAN).'],
    a:'Cadena de custodia CRÍTICA. Cualquier ruptura nulifica el proceso. Use siempre guantes.' },
  armas:      { t:'🔫 Armas Ilegales',         l:'Ley de Armas · CP Art.346-347',
    p:['Asegure el área y al sospechoso con cuidado.','Verifique que el arma no esté amartillada.','NO toque el arma directamente — use guantes.','Incaute con bolsa de evidencia sellada.','Registre número de serie, calibre y estado.','Elabore acta de incautación con testigos.','Traslade al laboratorio para prueba de idoneidad.','Notifique a FGR e informe a la unidad de armas.'],
    a:'NUNCA apunte ni accione el arma. Trátela como si estuviera cargada siempre.' },
  menor:      { t:'👦 Menor Infractor',         l:'Ley Penal Juvenil · CN Art.35',
    p:['Verifique la edad del menor (solicite DUI o partida).','Notifique a los padres o tutores inmediatamente.','Traslade a instalaciones para menores (no a bartolinas de adultos).','Notifique a la FGR y al Juzgado de Menores.','NO interrogue al menor sin presencia de adulto responsable.','Documente el incidente respetando la identidad del menor.','Evalúe medidas alternas si el delito es leve.','Coordine con PGR si el menor no tiene representante.'],
    a:'Los menores tienen derechos especiales. Mezclarlos con adultos es violación de ley y DDHH.' },
};

function protocolo(tipo) {
  const p = PROT[tipo];
  const el = document.getElementById('protResult');
  let html = `<div class="proto-card">
    <div class="proto-head">${p.t}</div>
    <div class="text-muted mb-3" style="font-size:.8rem"><i class="bi bi-book me-1"></i>${p.l}</div>`;
  p.p.forEach((s, i) => {
    html += `<div class="proto-step"><div class="proto-num">${i+1}</div><div class="proto-txt">${esc(s)}</div></div>`;
  });
  html += `<div class="proto-alert"><i class="bi bi-exclamation-triangle-fill me-2"></i>${esc(p.a)}</div>
    <div class="mt-3">
      <button class="btn btn-sm btn-outline-primary" onclick="ampliarProtocolo('${tipo}')">
        <i class="bi bi-stars me-1"></i>Ampliar con Gemini AI
      </button>
    </div>
  </div>`;
  el.innerHTML = html;
  el.scrollIntoView({ behavior:'smooth' });
}

async function ampliarProtocolo(tipo) {
  const p = PROT[tipo];
  showLoad('Consultando Gemini AI...');
  try {
    const resp = await gemini(`Dame el protocolo completo y detallado para ${p.t.replace(/^[^\w]+/,'')} según legislación salvadoreña vigente. Incluye artículos exactos, derechos del imputado/víctima, plazos legales, errores comunes a evitar y posibles consecuencias por incumplimiento.`);
    const d = document.createElement('div');
    d.className = 'card-panel mt-3';
    d.innerHTML = fmtLegal(resp);
    document.getElementById('protResult').appendChild(d);
  } catch(e) {
    toast(e.message, 'danger');
  } finally { hideLoad(); }
}

// ══ INFORMES ══════════════════════════════════════════════════
async function genInforme() {
  const tipo   = document.getElementById('infoTipo').value;
  const exp    = document.getElementById('infoExp').value.trim();
  const agente = document.getElementById('infoAgente').value.trim();
  const unidad = document.getElementById('infoUnidad').value.trim();
  const hecho  = document.getElementById('infoHecho').value.trim();
  if (!hecho) { toast('Describa el hecho o incidente', 'warning'); return; }
  const fecha = new Date().toLocaleString('es-SV', { timeZone:'America/El_Salvador' });
  const prompt = `Redacta un ${tipo} oficial de la República de El Salvador con estos datos:
Tipo de documento: ${tipo}
N° Expediente: ${exp||'Por asignar'}
Agente / Funcionario: ${agente||'No especificado'}
Unidad: ${unidad||'No especificada'}
Fecha y hora: ${fecha}
Descripción del hecho: ${hecho}

El documento debe: usar lenguaje oficial institucional, citar artículos legales aplicables, incluir sección de hechos, actuaciones realizadas, observaciones y espacio para firma. Listo para presentar ante fiscalía o juzgado.`;
  showLoad('Generando documento con Gemini...');
  try {
    const resp = await gemini(prompt);
    saveQuery(`${tipo}: ${hecho.substring(0,50)}`, 'INFORME', resp);
    const el = document.getElementById('infoResult');
    el.innerHTML = `
      <div class="card-panel">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h6 class="mb-0 fw-bold"><i class="bi bi-file-earmark-check me-2 text-success"></i>Documento generado</h6>
          <button class="btn btn-sm btn-outline-secondary" onclick="exportPDF()"><i class="bi bi-file-earmark-pdf me-1"></i>PDF</button>
        </div>
        <div class="informe-prev" id="infoContent">
          <div class="inf-head">
            <h3>REPÚBLICA DE EL SALVADOR</h3>
            <h3>${esc(unidad||'POLICÍA NACIONAL CIVIL')}</h3>
            <h3>${esc(tipo.toUpperCase())}</h3>
            <p>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</p>
          </div>
          <div class="inf-field"><strong>N° Expediente:</strong> ${esc(exp||'Por asignar')}</div>
          <div class="inf-field"><strong>Fecha/Hora:</strong> ${fecha}</div>
          <div class="inf-field"><strong>Agente:</strong> ${esc(agente||'No especificado')}</div>
          <div class="inf-div"></div>
          <div class="inf-body">${esc(resp)}</div>
          <div class="inf-firma">
            <p>────────────────────────</p>
            <p>${esc(agente||'Firma del Agente')}</p>
            <p>${esc(unidad||'')}</p>
            <p>Fecha: ${fecha}</p>
          </div>
        </div>
      </div>`;
    el.scrollIntoView({ behavior:'smooth' });
    document.getElementById('btnPDF').style.display = 'inline-flex';
  } catch(e) {
    toast(e.message, 'danger');
  } finally { hideLoad(); }
}

function exportPDF() {
  const c = document.getElementById('infoContent');
  if (!c) return;
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Informe LexSV AI</title>
    <style>body{font-family:'Courier New',monospace;padding:2cm;font-size:11pt}
    h3{text-align:center;text-transform:uppercase}.inf-div{border-top:1px solid #000;margin:.8rem 0}
    .inf-firma{margin-top:2rem;text-align:right}@media print{body{margin:0}}</style></head>
    <body>${c.innerHTML}</body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 500);
}

// ══ FAVORITOS ════════════════════════════════════════════════
function loadFavs() {
  try { S.favs = JSON.parse(localStorage.getItem('lx_favs') || '[]'); } catch { S.favs = []; }
}
function saveFavs() { localStorage.setItem('lx_favs', JSON.stringify(S.favs)); }

function addFav(titulo, resumen) {
  const item = { id: Date.now(), titulo: titulo.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>'), resumen, fecha: new Date().toLocaleDateString('es-SV') };
  S.favs.unshift(item);
  if (S.favs.length > 50) S.favs = S.favs.slice(0, 50);
  saveFavs();
  toast('⭐ Guardado en favoritos', 'success');
}

function removeFav(id) {
  S.favs = S.favs.filter(f => f.id !== id);
  saveFavs();
  renderFavs();
}

function renderFavs() {
  const el = document.getElementById('favList');
  const em = document.getElementById('favEmpty');
  if (!S.favs.length) { el.innerHTML = ''; em.style.display = 'block'; return; }
  em.style.display = 'none';
  el.innerHTML = S.favs.map(f => `
    <div class="fav-item">
      <div class="fav-item-body" onclick="sendQ(${JSON.stringify(f.titulo)});showSection('chat')">
        <div class="fav-item-title">${esc(f.titulo)}</div>
        <div class="fav-item-meta">${esc(f.resumen.substring(0,80))}... · ${f.fecha}</div>
      </div>
      <button class="fav-del" onclick="removeFav(${f.id})" title="Eliminar"><i class="bi bi-trash"></i></button>
    </div>`).join('');
}

// ══ HISTORIAL ════════════════════════════════════════════════
function loadQueries() {
  try { S.queries = JSON.parse(localStorage.getItem('lx_hist') || '[]'); } catch { S.queries = []; }
}

function saveQuery(q, tipo, resp) {
  const item = { id: Date.now(), q, tipo, resp: resp.substring(0,300), ts: new Date().toLocaleString('es-SV') };
  S.queries.unshift(item);
  if (S.queries.length > 50) S.queries = S.queries.slice(0,50);
  localStorage.setItem('lx_hist', JSON.stringify(S.queries));
}

function renderHistory() {
  const el = document.getElementById('histList');
  const em = document.getElementById('histEmpty');
  if (!S.queries.length) { el.innerHTML = ''; em.style.display = 'block'; return; }
  em.style.display = 'none';
  const colors = { CHAT:'var(--pri)', BÚSQUEDA:'var(--green)', COMPARAR:'var(--warn)', RESUMEN:'#6f42c1', CÁMARA:'#0d6efd', INFORME:'#6c757d', EMERGENCIA:'var(--red)' };
  el.innerHTML = S.queries.map(q => `
    <div class="hist-item" onclick="sendQ(${JSON.stringify(q.q)});showSection('chat')">
      <div class="hist-q">${esc(q.q)}</div>
      <div class="hist-meta">
        <span class="hist-type" style="background:${colors[q.tipo]||'var(--pri)'}15;color:${colors[q.tipo]||'var(--pri)'}">${q.tipo}</span>
        <span>${q.ts}</span>
      </div>
    </div>`).join('');
}

function clearHistory() {
  if (!confirm('¿Limpiar todo el historial?')) return;
  S.queries = [];
  localStorage.removeItem('lx_hist');
  renderHistory();
  toast('Historial limpiado', 'info');
}

// ══ LEYES OFFLINE ════════════════════════════════════════════
const OFFLINE_LEYES = [
  { title:'Código Penal – Delitos más comunes', icon:'⚖️', arts:[
    { n:'Art. 128 – Homicidio simple',     t:'El que matare a otro será sancionado con prisión de diez a veinte años.' },
    { n:'Art. 129 – Homicidio agravado',   t:'Prisión de veinte a treinta años cuando ocurra en pariente, con alevosía, por precio, cometido por funcionario, entre otros.' },
    { n:'Art. 207 – Robo',                 t:'Apoderamiento de cosa mueble ajena con violencia o intimidación en las personas. Prisión de seis a diez años.' },
    { n:'Art. 208 – Hurto',                t:'Apoderamiento de cosa mueble ajena sin violencia. Prisión de dos a cinco años.' },
    { n:'Art. 214 – Extorsión',            t:'Obligar a otro mediante violencia o amenaza a realizar un acto. Prisión de seis a quince años.' },
    { n:'Art. 34 – Tráfico drogas',        t:'Transporte, distribución o venta de drogas. Prisión de ocho a quince años.' },
  ]},
  { title:'Derechos del Detenido', icon:'🛡️', arts:[
    { n:'Art. 12 Constitución',     t:'Toda persona a quien se impute un delito se presumirá inocente mientras no se pruebe su culpabilidad.' },
    { n:'Art. 13 Constitución',     t:'No pueden restringirse la libertad personal sin orden escrita de juez competente. En flagrancia puede detener cualquier persona.' },
    { n:'Derecho al silencio',      t:'Nadie puede ser obligado a declarar contra sí mismo.' },
    { n:'Derecho a defensa',        t:'Derecho a ser asistido por abogado defensor desde el momento de la detención.' },
    { n:'Notificación de captura',  t:'Se debe informar a familiar o persona de confianza del detenido dentro de las 6 horas.' },
    { n:'Traslado a audiencia',     t:'El detenido debe ser presentado ante juez dentro de las 72 horas de la detención.' },
  ]},
  { title:'Ley de Tránsito – Infracciones', icon:'🚗', arts:[
    { n:'Art. 145 – Conducción peligrosa', t:'Manejar a exceso de velocidad, en estado de ebriedad o sin respetar señales. Multa y suspensión de licencia.' },
    { n:'Art. 147 – Accidente con daños',  t:'Obligación de auxiliar a heridos, dar datos y reportar a autoridades.' },
    { n:'Art. 149 – Sin licencia',         t:'Conducir vehículo sin licencia. Multa y retención del vehículo.' },
    { n:'Art. 160 – Alcoholemia',          t:'Conducir con 0.5 g/l o más de alcohol en sangre. Multa, suspensión y posible arresto.' },
  ]},
  { title:'Captura en Flagrancia', icon:'🔒', arts:[
    { n:'Definición (Art. 323 CPP)',        t:'Delito flagrante: cuando el delincuente es sorprendido en el momento de cometerlo o inmediatamente después.' },
    { n:'Facultad de detención',            t:'Cualquier persona puede detener en flagrancia. Debe entregar al detenido a la PNC de inmediato.' },
    { n:'Plazo de detención',               t:'Máximo 6 horas. Luego debe presentarse ante la FGR o liberarse.' },
    { n:'Informe de captura',               t:'El agente debe elaborar informe detallado dentro de las 24 horas.' },
  ]},
  { title:'LEIV – Violencia contra la Mujer', icon:'💜', arts:[
    { n:'Art. 9 – Violencia económica',     t:'Control de bienes, recursos económicos o patrimonio de la mujer.' },
    { n:'Art. 10 – Violencia feminicida',   t:'Acción u omisión que pone en riesgo la vida de la mujer. Prisión de 20 a 35 años.' },
    { n:'Art. 51 – Medidas cautelares',     t:'Alejamiento del agresor, prohibición de acercamiento y comunicación con la víctima.' },
    { n:'Art. 56 – Protocolos',             t:'Las autoridades DEBEN activar protocolos de atención especializada a víctimas.' },
  ]},
];

function buildOffline() {
  const el = document.getElementById('offlineGrid');
  el.innerHTML = OFFLINE_LEYES.map((ley, i) => `
    <div class="off-card">
      <div class="off-head" onclick="toggleOffline(${i})">
        <div class="off-title">${ley.icon} ${esc(ley.title)}</div>
        <div class="d-flex align-items-center gap-2">
          <span class="off-badge">OFFLINE</span>
          <i class="bi bi-chevron-down" id="offChev${i}"></i>
        </div>
      </div>
      <div class="off-body" id="offBody${i}">
        ${ley.arts.map(a => `<div class="off-art"><strong>${esc(a.n)}</strong>${esc(a.t)}</div>`).join('')}
      </div>
    </div>`).join('');
}

function toggleOffline(i) {
  const body = document.getElementById('offBody' + i);
  const chev = document.getElementById('offChev' + i);
  const open = body.classList.toggle('open');
  chev.style.transform = open ? 'rotate(180deg)' : '';
}

// ══ VOZ ═══════════════════════════════════════════════════════
function startVoiceGlobal() { showSection('chat'); toggleVoiceChat(); }

function toggleVoiceChat() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { toast('Reconocimiento de voz no disponible en este navegador', 'warning'); return; }
  if (S.voiceOn) { S.recog?.stop(); stopVoice(); return; }
  const r = new SR();
  r.lang = 'es-SV'; r.continuous = false; r.interimResults = false;
  S.recog = r;
  r.onresult = e => {
    const t = e.results[0][0].transcript;
    document.getElementById('chatTxt').value = t;
    sendChat();
  };
  r.onerror = () => { toast('Error de reconocimiento de voz', 'danger'); stopVoice(); };
  r.onend   = stopVoice;
  r.start();
  S.voiceOn = true;
  document.getElementById('voiceChatBtn').classList.add('active-voice');
  document.getElementById('voiceGlobalBtn').classList.add('active-voice');
  toast('🎤 Escuchando... hable ahora', 'info');
}

function stopVoice() {
  S.voiceOn = false;
  document.getElementById('voiceChatBtn')?.classList.remove('active-voice');
  document.getElementById('voiceGlobalBtn')?.classList.remove('active-voice');
}

// ══ UTILIDADES ════════════════════════════════════════════════
function showLoad(t = 'Procesando...') {
  document.getElementById('loadTxt').textContent = t;
  document.getElementById('loadingOv').style.display = 'flex';
}
function hideLoad() { document.getElementById('loadingOv').style.display = 'none'; }

function toast(msg, type = 'primary') {
  const m = { primary:'text-bg-primary', warning:'text-bg-warning', danger:'text-bg-danger', info:'text-bg-info', success:'text-bg-success' };
  const t = document.getElementById('appToast');
  t.className = `toast align-items-center border-0 ${m[type]||m.primary}`;
  document.getElementById('toastMsg').textContent = msg;
  new bootstrap.Toast(t, { delay:3000 }).show();
}

function esc(t) {
  if (!t) return '';
  return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ══ SERVICE WORKER ════════════════════════════════════════════
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// ESC cierra sidebar
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const sb = document.getElementById('sidebar');
    if (sb?.classList.contains('open')) toggleSidebar();
  }
});
