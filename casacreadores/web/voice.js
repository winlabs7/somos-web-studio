(function () {
  const SAMPLE_RATE = 24000;
  const WS_URL = "wss://api.x.ai/v1/realtime?model=grok-voice-think-fast-2.0";

  const PERSONA = `Eres Sol, la voz de La Casa de los Creadores (Comercio Creativo) en Laureles, Medellín. Hablas español colombiano, cálido y directo. No eres un call center. Eres la cara de una agencia de talento.

La casa representa influencers, creadores de contenido y creadores UGC. Les pone el equipo para crecer y cobrar: edición, clips, community, estudio, lives. Cinco días a la semana en el estudio en Laureles. No hace falta un following enorme. Si no lo tienen, lo armamos. Lo que sí hace falta: disponibilidad, actitud, y ganas de ganar.

Puedes responder qué hacemos, cómo es el estudio, si tienen que vivir en Medellín (sí, lunes a viernes en Laureles), si pedimos seguidores (no es un número; si no hay following, se construye), qué tipos de talento (todos: influencers, creadores, UGC). Si preguntan por plata o contratos, di que eso lo habla el equipo humano, no inventes números.

NUNCA nombres OnlyFans. Nunca nombres plataformas de suscripción para adultos. Nunca digas "contenido para adultos" ni "familia" ni "secreto". Si preguntan por un tipo de cuenta privada, habla en general: representamos todo tipo de talento y el equipo opera las cuentas. Cambia de tema a estudio, equipo, o disponibilidad.

Si el visitante llegó como creador (quiere unirse), primero responde lo que pregunte. Cuando ya entendieron, junta datos, una pregunta a la vez:
1. Nombre
2. WhatsApp
3. Ciudad, y si pueden venir lunes a viernes a Laureles
4. Handle si tienen (Instagram, TikTok, YouTube). Si no tienen, está bien.
5. Qué hacen o qué les gustaría crear
6. Si ya tienen following o lo están empezando
7. Si alguien ya los representa

Si llegó como marca o equipo, no hagas el intake de creador. Marca: nombre, empresa, WhatsApp, qué necesitan, timing. Equipo: nombre, WhatsApp, ciudad, qué silla, herramientas, cuándo pueden empezar.

Cuando tengas lo clave, resume en 20 segundos, confirma, llama a submit_lead, y di que el equipo escribe por WhatsApp. Luego despídete.

Nunca inventes tarifas ni salarios. Nunca pidas contraseñas. Nunca pidas que se muden a dormir en la casa. Venir a trabajar a Laureles sí. Respuestas cortas. Una pregunta por turno cuando estés entrevistando.`

  const TOOLS = [{
    type: "function",
    name: "submit_lead",
    description: "Guarda la entrevista cuando ya tienes los datos clave.",
    parameters: {
      type: "object",
      properties: {
        tipo: { type: "string", enum: ["creador", "marca", "equipo"] },
        nombre: { type: "string" },
        whatsapp: { type: "string" },
        email: { type: "string" },
        ciudad: { type: "string" },
        handle: { type: "string" },
        nicho: { type: "string" },
        seguidores: { type: "string" },
        post_show: { type: "string" },
        necesita: { type: "string" },
        representado: { type: "string" },
        plataforma: { type: "string" },
        productos: { type: "string" },
        comunidad_pago: { type: "string" },
        podcast: { type: "string" },
        empresa: { type: "string" },
        campana: { type: "string" },
        timing: { type: "string" },
        audiencia: { type: "string" },
        presupuesto: { type: "string" },
        silla: { type: "string" },
        herramientas: { type: "string" },
        ultimo_trabajo: { type: "string" },
        disponibilidad: { type: "string" },
        notas: { type: "string" }
      },
      required: ["tipo", "nombre"]
    }
  }];

  let ws, audioCtx, micNode, mediaStream, playing = false, playTime = 0, pendingFns = 0;
  let tipo = "creador";

  const $ = (id) => document.getElementById(id);
  function setStatus(t) { const el = $("voice-status"); if (el) el.textContent = t; }
  function addLine(who, text) {
    const box = $("voice-log");
    if (!box || !text) return;
    const p = document.createElement("p");
    p.className = "v-line " + who;
    p.textContent = (who === "ai" ? "Sol · " : "Tú · ") + text;
    box.appendChild(p);
    box.scrollTop = box.scrollHeight;
  }

  function floatToB64(float32) {
    const pcm = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    const bytes = new Uint8Array(pcm.buffer);
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  function b64ToFloat(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const pcm = new Int16Array(bytes.buffer);
    const out = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] / 32768;
    return out;
  }

  function playPcm(float32) {
    if (!audioCtx || !float32.length) return;
    const buf = audioCtx.createBuffer(1, float32.length, SAMPLE_RATE);
    buf.getChannelData(0).set(float32);
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    if (playTime < now) playTime = now;
    src.start(playTime);
    playTime += buf.duration;
  }

  async function mintToken() {
    const r = await fetch("/session", { method: "POST" });
    const d = await r.json();
    if (!d.value) throw new Error("no_token");
    return d.value;
  }

  async function handleFn(event) {
    pendingFns++;
    let args = {};
    try { args = JSON.parse(event.arguments || "{}"); } catch (e) {}
    args.tipo = args.tipo || tipo;
    try {
      await fetch("/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args)
      });
      addLine("ai", "Datos guardados para el equipo.");
    } catch (e) {}
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({
        type: "conversation.item.create",
        item: { type: "function_call_output", call_id: event.call_id, output: JSON.stringify({ ok: true }) }
      }));
    }
    pendingFns--;
    const wait = () => {
      if (playTime > (audioCtx ? audioCtx.currentTime : 0) + 0.05) {
        setTimeout(wait, 120);
        return;
      }
      if (ws && ws.readyState === 1 && pendingFns === 0) {
        ws.send(JSON.stringify({ type: "response.create" }));
      }
    };
    setTimeout(wait, 400);
  }

  async function start(kind) {
    tipo = kind;
    stop();
    $("voice-panel").classList.add("on");
    $("voice-log").innerHTML = "";
    setStatus("Pidiendo micrófono…");
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: SAMPLE_RATE }
      });
    } catch (e) {
      setStatus("Necesitamos el micrófono para la entrevista.");
      return;
    }
    setStatus("Conectando…");
    let token;
    try { token = await mintToken(); }
    catch (e) {
      setStatus("No pudimos abrir la entrevista. Intenta de nuevo.");
      return;
    }
    audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
    if (audioCtx.state === "suspended") await audioCtx.resume();
    playTime = audioCtx.currentTime;
    ws = new WebSocket(WS_URL, ["xai-client-secret." + token]);
    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: "session.update",
        session: {
          voice: "ara",
          instructions: PERSONA + "\n\nEste visitante llegó como: " + (tipo === "marca" ? "MARCA" : tipo === "equipo" ? "EQUIPO" : "CREADOR que quiere unirse a la casa. Eres Sol. Puedes explicar la agencia y luego tomar sus datos.") + ".",
          turn_detection: { type: "server_vad", silence_duration_ms: 700 },
          tools: TOOLS,
          audio: {
            input: {
              format: { type: "audio/pcm", rate: SAMPLE_RATE },
              transcription: { language_hint: "es-MX" }
            },
            output: { format: { type: "audio/pcm", rate: SAMPLE_RATE } }
          }
        }
      }));
      const src = audioCtx.createMediaStreamSource(mediaStream);
      micNode = audioCtx.createScriptProcessor(4096, 1, 1);
      src.connect(micNode);
      const mute = audioCtx.createGain();
      mute.gain.value = 0;
      micNode.connect(mute);
      mute.connect(audioCtx.destination);
      micNode.onaudioprocess = (ev) => {
        if (!ws || ws.readyState !== 1) return;
        const input = ev.inputBuffer.getChannelData(0);
        ws.send(JSON.stringify({ type: "input_audio_buffer.append", audio: floatToB64(input) }));
      };
      setStatus("Habla cuando quieras. Estamos en la llamada.");
      ws.send(JSON.stringify({ type: "response.create" }));
    };
    let userBits = "", aiBits = "";
    ws.onmessage = (msg) => {
      let ev;
      try { ev = JSON.parse(msg.data); } catch (e) { return; }
      const t = ev.type;
      if (t === "response.output_audio.delta" && ev.delta) playPcm(b64ToFloat(ev.delta));
      if (t === "response.output_audio_transcript.delta") { aiBits += ev.delta || ""; }
      if (t === "response.output_audio_transcript.done" || t === "response.audio_transcript.done") {
        if (aiBits.trim()) addLine("ai", aiBits.trim());
        aiBits = "";
      }
      if (t === "conversation.item.input_audio_transcription.completed" || t === "conversation.item.input_audio_transcription.updated") {
        const tx = ev.transcript || "";
        if (tx) { userBits = tx; }
      }
      if (t === "input_audio_buffer.speech_started") userBits = "";
      if (t === "input_audio_buffer.speech_stopped" && userBits.trim()) {
        addLine("you", userBits.trim());
        userBits = "";
      }
      if (t === "response.function_call_arguments.done") handleFn(ev);
      if (t === "error") setStatus("Se cortó. Vuelve a tocar hablar.");
    };
    ws.onclose = () => { if ($("voice-panel").classList.contains("on")) setStatus("Llamada cerrada."); };
    ws.onerror = () => setStatus("Error de conexión.");
    playing = true;
  }

  function stop() {
    playing = false;
    try { if (micNode) micNode.disconnect(); } catch (e) {}
    micNode = null;
    try { if (mediaStream) mediaStream.getTracks().forEach((t) => t.stop()); } catch (e) {}
    mediaStream = null;
    try { if (ws) ws.close(); } catch (e) {}
    ws = null;
    try { if (audioCtx) audioCtx.close(); } catch (e) {}
    audioCtx = null;
  }

  window.CasaVoice = { start, stop };
})();
