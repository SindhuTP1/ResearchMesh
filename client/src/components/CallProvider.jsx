import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { gql } from '@apollo/client';
import { useApolloClient, useSubscription } from '@apollo/client/react';
import { CALL_SIGNAL, SEND_CALL_SIGNAL } from '../graphql/operations.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useToast } from './ui.jsx';

/**
 * Video calls with WebRTC, signalled over the app's existing GraphQL WebSocket.
 *
 * Media flows peer-to-peer (mesh): every participant holds one RTCPeerConnection per other participant,
 * which suits 1:1 calls and small groups (up to ~6). The server only relays signalling messages:
 *
 *   RING   caller → everyone in the conversation       "a call started"
 *   JOIN   joiner → everyone (or one peer, as a reply)  "I'm in the call"
 *   OFFER / ANSWER / ICE  peer → peer                   standard WebRTC negotiation
 *   LEAVE  → everyone; DECLINE → caller
 *
 * Glare-free rule: when two participants discover each other, only the one with the smaller user id
 * sends the OFFER. If the larger one hears a broadcast JOIN, it replies with a directed JOIN so the
 * smaller one knows to offer.
 */

const ICE_SERVERS = (() => {
  try {
    const v = import.meta.env.VITE_ICE_SERVERS;
    if (v) return JSON.parse(v);
  } catch { /* fall through */ }
  return [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
})();
const RING_TIMEOUT_MS = 40_000;

const CallCtx = createContext(null);
export const useCall = () => useContext(CallCtx);

async function getMedia(audioOnly = false) {
  const md = navigator.mediaDevices;
  if (!md?.getUserMedia) return { stream: null, note: 'This browser cannot access a camera or microphone here (calls need https or localhost).' };
  if (audioOnly) {
    try {
      return { stream: await md.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }) };
    } catch {
      return { stream: null, note: 'No microphone permission — you can still hear others.' };
    }
  }
  try {
    return { stream: await md.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: true }) };
  } catch {
    try {
      return { stream: await md.getUserMedia({ audio: true }), note: 'No camera available — joined with audio only.' };
    } catch {
      return { stream: null, note: 'No camera or microphone permission — you can still see and hear others.' };
    }
  }
}

export function CallProvider({ children }) {
  const { user } = useAuth();
  const client = useApolloClient();
  const toast = useToast();

  const [incoming, setIncoming] = useState(null); // { conversationId, callId, from, title }
  const [call, setCall] = useState(null); // { conversationId, callId, title, direct }
  const [localStream, setLocalStream] = useState(null);
  const [peers, setPeers] = useState({}); // peerId → { name, stream, state }
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  const callRef = useRef(null);
  const localRef = useRef(null);
  const pcs = useRef(new Map()); // peerId → { pc, queue: RTCIceCandidateInit[] }
  const names = useRef(new Map());
  const ringTimer = useRef(null);
  const answerTimer = useRef(null);

  const send = useCallback(
    (input) => client.mutate({ mutation: SEND_CALL_SIGNAL, variables: { input } }).catch(() => {}),
    [client]
  );
  const sendInCall = useCallback(
    (type, extra = {}) => callRef.current && send({ conversationId: callRef.current.conversationId, callId: callRef.current.callId, type, ...extra }),
    [send]
  );

  const titleFor = (conversationId) => {
    try {
      return client.readFragment({ id: `Conversation:${conversationId}`, fragment: TITLE_FRAGMENT })?.title ?? null;
    } catch { return null; }
  };

  const dropPeer = useCallback((peerId) => {
    const entry = pcs.current.get(peerId);
    if (entry) entry.pc.close();
    pcs.current.delete(peerId);
    setPeers((p) => { const n = { ...p }; delete n[peerId]; return n; });
  }, []);

  const cleanup = useCallback(() => {
    for (const [, { pc }] of pcs.current) pc.close();
    pcs.current.clear();
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    callRef.current = null;
    clearTimeout(answerTimer.current);
    setLocalStream(null);
    setPeers({});
    setCall(null);
    setMicOn(true);
    setCamOn(true);
  }, []);

  const createPeer = useCallback((peerId) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const local = localRef.current;
    if (local) local.getTracks().forEach((t) => pc.addTrack(t, local));
    // Without local media, still ask to receive so the other side's offer/answer carries their tracks.
    if (!local?.getAudioTracks().length) pc.addTransceiver('audio', { direction: 'recvonly' });
    if (!local?.getVideoTracks().length) pc.addTransceiver('video', { direction: 'recvonly' });
    pc.onicecandidate = (e) => e.candidate && sendInCall('ICE', { to: peerId, payload: JSON.stringify(e.candidate) });
    pc.ontrack = (e) => setPeers((p) => ({ ...p, [peerId]: { ...p[peerId], stream: e.streams[0] } }));
    pc.onconnectionstatechange = () => {
      setPeers((p) => (p[peerId] ? { ...p, [peerId]: { ...p[peerId], state: pc.connectionState } } : p));
      if (pc.connectionState === 'failed') dropPeer(peerId);
    };
    pcs.current.set(peerId, { pc, queue: [] });
    clearTimeout(answerTimer.current);
    setPeers((p) => ({ ...p, [peerId]: { name: names.current.get(peerId) ?? 'Participant', stream: null, state: 'connecting' } }));
    return pcs.current.get(peerId);
  }, [sendInCall, dropPeer]);

  const flush = async (entry) => {
    for (const c of entry.queue.splice(0)) await entry.pc.addIceCandidate(c).catch(() => {});
  };

  const endIfAlone = useCallback((reason) => {
    if (callRef.current?.direct && pcs.current.size === 0) {
      if (reason) toast({ title: 'Call ended', body: reason });
      cleanup();
    }
  }, [cleanup, toast]);

  /* -------------------------- incoming signals -------------------------- */
  const handleSignal = async (s) => {
    const from = s.from;
    names.current.set(from.id, from.name);

    if (s.type === 'RING') {
      if (callRef.current) { send({ conversationId: s.conversationId, callId: s.callId, type: 'DECLINE', to: from.id, payload: 'busy' }); return; }
      clearTimeout(ringTimer.current);
      let meta = {};
      try { meta = JSON.parse(s.payload ?? '{}') ?? {}; } catch { /* old client */ }
      const direct = meta.direct ?? false;
      setIncoming({ conversationId: s.conversationId, callId: s.callId, from, direct, audioOnly: !!meta.audioOnly, title: direct ? null : meta.title ?? titleFor(s.conversationId) ?? 'Group call' });
      ringTimer.current = setTimeout(() => setIncoming(null), RING_TIMEOUT_MS);
      return;
    }
    // Caller hung up before we answered.
    if (s.type === 'LEAVE') setIncoming((i) => (i && i.callId === s.callId && i.from.id === from.id ? null : i));

    const current = callRef.current;
    if (!current || current.callId !== s.callId) return;

    switch (s.type) {
      case 'JOIN': {
        if (pcs.current.has(from.id)) return;
        if (user.id < from.id) {
          const entry = createPeer(from.id);
          const offer = await entry.pc.createOffer();
          await entry.pc.setLocalDescription(offer);
          sendInCall('OFFER', { to: from.id, payload: JSON.stringify(entry.pc.localDescription) });
        } else if (!s.to) {
          sendInCall('JOIN', { to: from.id }); // "I'm here too — you offer"
        }
        break;
      }
      case 'OFFER': {
        const entry = pcs.current.get(from.id) ?? createPeer(from.id);
        await entry.pc.setRemoteDescription(JSON.parse(s.payload));
        await flush(entry);
        const answer = await entry.pc.createAnswer();
        await entry.pc.setLocalDescription(answer);
        sendInCall('ANSWER', { to: from.id, payload: JSON.stringify(entry.pc.localDescription) });
        break;
      }
      case 'ANSWER': {
        const entry = pcs.current.get(from.id);
        if (!entry) return;
        await entry.pc.setRemoteDescription(JSON.parse(s.payload));
        await flush(entry);
        break;
      }
      case 'ICE': {
        const entry = pcs.current.get(from.id);
        if (!entry) return;
        const cand = JSON.parse(s.payload);
        if (entry.pc.remoteDescription) await entry.pc.addIceCandidate(cand).catch(() => {});
        else entry.queue.push(cand);
        break;
      }
      case 'LEAVE':
        dropPeer(from.id);
        endIfAlone(`${from.name} left the call.`);
        break;
      case 'DECLINE':
        toast({ title: s.payload === 'busy' ? `${from.name} is on another call` : `${from.name} declined`, body: '' });
        endIfAlone();
        break;
      default:
    }
  };
  const handlerRef = useRef(handleSignal);
  handlerRef.current = handleSignal;

  useSubscription(CALL_SIGNAL, {
    skip: !user || user.role === 'ADMIN',
    onData: ({ data }) => {
      const s = data.data?.callSignal;
      if (s) handlerRef.current(s).catch((e) => console.warn('call signal failed', e));
    },
  });

  /* ------------------------------- actions ------------------------------ */
  const begin = async (info) => {
    const { stream, note } = await getMedia(info.audioOnly);
    if (note) toast({ kind: 'error', title: 'Camera / microphone', body: note });
    localRef.current = stream;
    callRef.current = info;
    setLocalStream(stream);
    setCamOn(!!stream?.getVideoTracks().length);
    setMicOn(!!stream?.getAudioTracks().length);
    setCall({ ...info, startedAt: Date.now() });
  };

  const startCall = useCallback(async ({ conversationId, title, direct, audioOnly = false }) => {
    if (callRef.current) return toast({ kind: 'error', title: 'Already in a call', body: 'Hang up first.' });
    const info = { audioOnly, conversationId, callId: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`, title, direct };
    await begin(info);
    send({ conversationId, callId: info.callId, type: 'RING', payload: JSON.stringify({ direct: !!direct, audioOnly, title: direct ? null : title }) });
    if (direct) {
      answerTimer.current = setTimeout(() => {
        if (callRef.current?.callId === info.callId && pcs.current.size === 0) {
          sendInCall('LEAVE');
          toast({ title: 'No answer', body: `${title} didn't pick up.` });
          cleanup();
        }
      }, RING_TIMEOUT_MS);
    }
  }, [send, sendInCall, cleanup, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  const accept = useCallback(async () => {
    const inc = incoming;
    if (!inc) return;
    clearTimeout(ringTimer.current);
    setIncoming(null);
    await begin({ conversationId: inc.conversationId, callId: inc.callId, title: inc.direct ? inc.from.name : inc.title, direct: inc.direct, audioOnly: inc.audioOnly });
    sendInCall('JOIN');
  }, [incoming, sendInCall]); // eslint-disable-line react-hooks/exhaustive-deps

  const decline = useCallback(() => {
    if (!incoming) return;
    clearTimeout(ringTimer.current);
    send({ conversationId: incoming.conversationId, callId: incoming.callId, type: 'DECLINE', to: incoming.from.id });
    setIncoming(null);
  }, [incoming, send]);

  const hangUp = useCallback(() => {
    sendInCall('LEAVE');
    cleanup();
  }, [sendInCall, cleanup]);

  const toggleMic = () => {
    const tracks = localRef.current?.getAudioTracks() ?? [];
    if (!tracks.length) return;
    const on = !tracks[0].enabled;
    tracks.forEach((t) => { t.enabled = on; });
    setMicOn(on);
  };
  const toggleCam = () => {
    const tracks = localRef.current?.getVideoTracks() ?? [];
    if (!tracks.length) return;
    const on = !tracks[0].enabled;
    tracks.forEach((t) => { t.enabled = on; });
    setCamOn(on);
  };

  // Leave cleanly if the tab closes mid-call.
  useEffect(() => {
    const bye = () => callRef.current && sendInCall('LEAVE');
    window.addEventListener('beforeunload', bye);
    return () => window.removeEventListener('beforeunload', bye);
  }, [sendInCall]);

  const value = { call, startCall, inCall: !!call };
  return (
    <CallCtx.Provider value={value}>
      {children}
      {incoming && <IncomingCall incoming={incoming} onAccept={accept} onDecline={decline} />}
      {call && (
        <CallWindow
          call={call} localStream={localStream} peers={peers} me={user}
          micOn={micOn} camOn={camOn} onMic={toggleMic} onCam={toggleCam} onHangUp={hangUp}
        />
      )}
    </CallCtx.Provider>
  );
}

const TITLE_FRAGMENT = gql`fragment CallTitle on Conversation { title }`;

function IncomingCall({ incoming, onAccept, onDecline }) {
  return (
    <div className="incoming-call" role="alertdialog" aria-label="Incoming video call">
      <div className="pulse" aria-hidden="true">{incoming.audioOnly ? '📞' : '📹'}</div>
      <div>
        <b>{incoming.from.name}</b> {incoming.audioOnly ? 'voice' : 'video'} calling
        {!incoming.direct && incoming.title && <div className="faint">Group call in {incoming.title}</div>}
      </div>
      <div className="row">
        <button className="btn btn-primary btn-sm" onClick={onAccept}>Join</button>
        <button className="btn btn-sm btn-danger" onClick={onDecline}>Decline</button>
      </div>
    </div>
  );
}

function Video({ stream, muted, mirror }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream ?? null;
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={muted} className={mirror ? 'mirror' : ''} />;
}

const initials = (name = '') => name.replace(/^Dr\.\s*/, '').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();

function useElapsed(since) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const sec = Math.max(0, Math.floor((now - since) / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

/** Plays remote audio for voice calls (no <video> element there). */
function Audio({ stream }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream ?? null;
  }, [stream]);
  return <audio ref={ref} autoPlay />;
}

function CallWindow({ call, localStream, peers, me, micOn, camOn, onMic, onCam, onHangUp }) {
  const [big, setBig] = useState(!call.audioOnly);
  const elapsed = useElapsed(call.startedAt);
  const list = Object.entries(peers);
  const hasVideo = (s) => !call.audioOnly && !!s?.getVideoTracks().some((t) => t.readyState === 'live');
  return (
    <div className={`call-window ${big ? 'big' : 'small'} ${call.audioOnly ? 'voice' : ''}`} role="dialog" aria-label={`${call.audioOnly ? 'Voice' : 'Video'} call: ${call.title}`}>
      <div className="call-head">
        <span className="call-kind" aria-hidden="true">{call.audioOnly ? '📞' : '📹'}</span>
        <b>{call.title}</b>
        <span className="faint">{list.length === 0 ? 'Ringing…' : `${list.length + 1} in call · ${elapsed}`}</span>
        <button className="btn btn-ghost btn-sm" onClick={() => setBig(!big)} aria-label={big ? 'Minimise call' : 'Expand call'}>{big ? '–' : '⤢'}</button>
      </div>
      <div className={`call-grid n${Math.min(list.length + 1, 6)}`}>
        {list.map(([id, p]) => (
          <div className={`tile ${p.state === 'connected' ? 'live' : ''}`} key={id}>
            {p.stream && (call.audioOnly ? <Audio stream={p.stream} /> : <Video stream={p.stream} />)}
            {!hasVideo(p.stream) && <div className="tile-avatar">{initials(p.name)}</div>}
            <span className="tile-name">{p.name}{p.state && p.state !== 'connected' ? ` · ${p.state}` : ''}</span>
          </div>
        ))}
        <div className="tile self">
          {localStream && camOn && hasVideo(localStream) ? <Video stream={localStream} muted mirror /> : <div className="tile-avatar">{initials(me?.name)}</div>}
          <span className="tile-name">You{micOn ? '' : ' · muted'}</span>
        </div>
      </div>
      <div className="call-controls">
        <button className={`btn btn-sm ${micOn ? '' : 'off'}`} onClick={onMic} disabled={!localStream?.getAudioTracks().length}>{micOn ? 'Mute' : 'Unmute'}</button>
        {!call.audioOnly && <button className={`btn btn-sm ${camOn ? '' : 'off'}`} onClick={onCam} disabled={!localStream?.getVideoTracks().length}>{camOn ? 'Camera off' : 'Camera on'}</button>}
        <button className="btn btn-sm hang-up" onClick={onHangUp}>Leave call</button>
      </div>
    </div>
  );
}
