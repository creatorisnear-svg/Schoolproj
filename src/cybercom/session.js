import {
  joinVoiceChannel, EndBehaviorType, VoiceConnectionStatus, entersState,
  createAudioPlayer, createAudioResource, StreamType, AudioPlayerStatus,
} from '@discordjs/voice';
import { Readable } from 'stream';
import { createWavBuffer, RADIO_WAVE_BUFFER, TolerantDecoder } from '../utils/voiceListener.js';
import { helperUserIds } from './helpers.js';
import { yesOrNo } from './text.js';

/**
 * One helper bot sitting in one voice channel.
 *
 * It joins the channel, hears each person separately, hands what they said
 * to the brain (brain.js), and speaks replies in the dispatcher's voice. In
 * police and traffic stop channels every reply starts with the radio click,
 * as the dispatcher's do; civilian channels are not a radio, so no click.
 *
 * Several helpers can be in one server, so each joins in its own connection
 * group: @discordjs/voice otherwise keeps one connection per server.
 */

const SILENCE_MS = 800;          // a radio pause mid sentence is not the end of it
const MIN_CHUNKS = 15;          // about 300 ms: shorter is a cough or a click
const GREET_EVERY_MS = 30 * 60 * 1000;
const GREET_GAP_MS = 20 * 1000;

const isBot = (guild, userId) =>
  helperUserIds().has(userId)
  || !!guild?.members.cache.get(userId)?.user?.bot
  || !!guild?.voiceStates?.cache.get(userId)?.member?.user?.bot;

let externalIp = null;
async function publicIp() {
  if (externalIp) return externalIp;
  try { externalIp = (await (await fetch('https://api.ipify.org?format=json')).json()).ip; } catch {}
  return externalIp || '127.0.0.1';
}

/**
 * The same UDP discovery workaround the dispatcher needs on Koyeb (see
 * voiceListener.moveToChannel): when IP discovery never answers, answer it
 * ourselves with the public IP and the socket's port.
 */
function installUdpBypass(connection, isCurrent) {
  connection.on('stateChange', (oldState, newState) => {
    const net = newState.networking;
    if (!net || net === oldState.networking) return;
    let fired = false;
    net.on('stateChange', (_o, n) => {
      if (n.code !== 2 || !n.udp || fired) return;
      fired = true;
      const udp = n.udp;
      const ssrc = n.connectionData?.ssrc || 0;
      setTimeout(async () => {
        if (connection.state.status === VoiceConnectionStatus.Ready || !isCurrent()) return;
        const ip = await publicIp();
        const port = await new Promise((resolve) => {
          const start = Date.now();
          const tryPort = () => {
            if (connection.state.status === VoiceConnectionStatus.Ready || !isCurrent() || Date.now() - start > 2000) return resolve(0);
            try { const p = udp.socket.address().port; if (p > 0) return resolve(p); } catch {}
            setImmediate(tryPort);
          };
          tryPort();
        });
        if (!port) return;
        const fake = Buffer.alloc(74);
        fake.writeUInt16BE(2, 0);
        fake.writeUInt16BE(70, 2);
        fake.writeUInt32BE(ssrc, 4);
        fake.write(ip, 8, 'utf8');
        fake.writeUInt16BE(port, 72);
        udp.socket.emit('message', fake);
      }, 3000);
    });
  });
}

export class Session {
  /**
   * @param helper   from helpers.js
   * @param role     'civilian' | 'stop' | 'radio'
   * @param handler  async (session, userId, wav, seconds) => void
   */
  constructor({ helper, guildId, channelId, role, handler, tts }) {
    this.helper = helper;
    this.guildId = guildId;
    this.channelId = channelId;
    this.role = role;
    this.handler = handler;
    this.tts = tts;               // async (text) => audio Buffer
    this.connection = null;
    this.queue = [];
    this.playing = false;
    this.recording = new Set();
    this.pending = new Map();     // userId → answer callback
    this.goAhead = new Map();     // userId → when they called with just the wake word
    this.greeted = new Map();     // userId → when
    this.lastGreet = 0;
    this.closed = false;
  }

  get guild() { return this.helper.client.guilds.cache.get(this.guildId) || null; }
  get channel() { return this.guild?.channels.cache.get(this.channelId) || null; }
  get radio() { return this.role !== 'civilian'; }

  async join() {
    const guild = this.guild;
    if (!guild) throw new Error('helper ' + this.helper.index + ' is not in this server');
    let canJoin = true;
    try { canJoin = this.channel?.joinable !== false && this.channel?.speakable !== false; } catch {}
    if (!canJoin) throw new Error('no View Channel, Connect or Speak permission there, or the channel is full');
    const connection = joinVoiceChannel({
      channelId: this.channelId,
      guildId: this.guildId,
      adapterCreator: guild.voiceAdapterCreator,
      group: 'cybercom-' + this.helper.index,
      selfDeaf: false,
      selfMute: false,
    });
    this.connection = connection;
    installUdpBypass(connection, () => this.connection === connection && !this.closed);
    connection.on('error', (err) => console.error(`[CyberCom] helper ${this.helper.index} voice error:`, err.message));
    this.listen(connection);
    await entersState(connection, VoiceConnectionStatus.Ready, 25000);
    // Say plainly that this channel is transcribed: the nickname shows it.
    guild.members.me?.setNickname(`RPM CyberCom ${this.helper.index} (transcribing)`).catch(() => {});
    return connection;
  }

  listen(connection) {
    const receiver = connection.receiver;
    receiver.speaking.on('start', (userId) => {
      if (this.closed || this.recording.has(userId) || isBot(this.guild, userId)) return;
      this.recording.add(userId);
      const chunks = [];
      let stream;
      let decoder;
      const finish = () => {
        this.recording.delete(userId);
        try { stream?.destroy(); } catch {}
      };
      const safety = setTimeout(finish, 30000);
      try {
        // A fresh subscription every time (see voiceListener's receiver), and a
        // decoder that skips a scrambled packet rather than losing the line.
        const stale = receiver.subscriptions.get(userId);
        if (stale) {
          stale.removeAllListeners('close');
          receiver.subscriptions.delete(userId);
          try { stale.destroy(); } catch {}
        }
        stream = receiver.subscribe(userId, { end: { behavior: EndBehaviorType.AfterSilence, duration: SILENCE_MS } });
        decoder = new TolerantDecoder({ frameSize: 960, channels: 2, rate: 48000 });
      } catch {
        clearTimeout(safety);
        finish();
        return;
      }
      stream.pipe(decoder);
      decoder.on('data', (c) => chunks.push(c));
      decoder.on('error', () => { clearTimeout(safety); finish(); });
      decoder.on('end', () => {
        clearTimeout(safety);
        this.recording.delete(userId);
        if (chunks.length < MIN_CHUNKS || this.closed) return;
        const seconds = chunks.length * 0.02;
        const wav = createWavBuffer(chunks);
        Promise.resolve(this.handler(this, userId, wav, seconds))
          .catch((err) => console.error('[CyberCom] could not handle speech:', err.message));
      });
    });
  }

  /** Say something; resolves once it has been played. */
  async speak(text) {
    if (this.closed || !text) return;
    let audio;
    try { audio = await this.tts(text); } catch (err) {
      console.error('[CyberCom] voice failed:', err.message);
      return;
    }
    await new Promise((resolve) => {
      this.queue.push({ audio, resolve });
      if (!this.playing) this.drain();
    });
  }

  async drain() {
    this.playing = true;
    while (this.queue.length && !this.closed) {
      const { audio, resolve } = this.queue.shift();
      try {
        if (this.radio && RADIO_WAVE_BUFFER) await this.play(RADIO_WAVE_BUFFER);
        await this.play(audio);
      } finally {
        resolve();
      }
    }
    this.playing = false;
  }

  async play(buffer) {
    const conn = this.connection;
    if (!conn || this.closed) return;
    if (conn.state.status !== VoiceConnectionStatus.Ready) {
      try { await entersState(conn, VoiceConnectionStatus.Ready, 15000); } catch { return; }
    }
    await new Promise((resolve) => {
      try {
        const player = createAudioPlayer();
        const isOgg = buffer.length >= 4 && buffer.toString('ascii', 0, 4) === 'OggS';
        const resource = createAudioResource(Readable.from([buffer]), { inputType: isOgg ? StreamType.OggOpus : StreamType.Arbitrary });
        const timer = setTimeout(() => { try { player.stop(); } catch {} resolve(); }, 45000);
        const done = () => { clearTimeout(timer); resolve(); };
        player.on(AudioPlayerStatus.Idle, done);
        player.on('error', done);
        conn.subscribe(player);
        player.play(resource);
      } catch {
        resolve();
      }
    });
  }

  /**
   * Ask people a yes or no question out loud. Resolves with a Map of
   * userId → 'yes' | 'no' | null (no answer in time).
   */
  ask(userIds, question, timeoutMs = 25000) {
    const answers = new Map(userIds.map((id) => [id, null]));
    if (!userIds.length) return Promise.resolve(answers);
    return new Promise((resolve) => {
      let left = userIds.length;
      let timer = null;
      const finish = () => {
        clearTimeout(timer);
        for (const id of userIds) if (this.pending.get(id)?.owner === finish) this.pending.delete(id);
        resolve(answers);
      };
      for (const id of userIds) {
        const answer = (value) => {
          if (answers.get(id) !== null) return;
          answers.set(id, value);
          if (--left === 0) finish();
        };
        answer.owner = finish;
        this.pending.set(id, answer);
      }
      // The clock starts once the question has been heard.
      this.speak(question).finally(() => { timer = setTimeout(finish, timeoutMs); });
    });
  }

  /** A yes or no to a question this helper asked. True when it was one. */
  answer(userId, text) {
    const callback = this.pending.get(userId);
    if (!callback) return false;
    const value = yesOrNo(text);
    if (!value) return false;
    callback(value);
    return true;
  }

  /** Tell someone who just joined how to talk to it, and that it transcribes. */
  greet(userId, text) {
    const now = Date.now();
    if (now - (this.greeted.get(userId) || 0) < GREET_EVERY_MS) return;
    this.greeted.set(userId, now);
    // A group arriving together hears it once.
    if (now - this.lastGreet < GREET_GAP_MS) return;
    this.lastGreet = now;
    this.speak(text).catch(() => {});
  }

  leave() {
    this.closed = true;
    for (const callback of this.pending.values()) { try { callback(null); } catch {} }
    this.pending.clear();
    this.queue.splice(0).forEach((q) => q.resolve());
    try { this.connection?.destroy(); } catch {}
    this.connection = null;
  }
}
