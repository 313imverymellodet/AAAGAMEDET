// Minimal RFC 6455 WebSocket server (text frames, ping/pong, close, fragmentation).
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_MESSAGE = 64 * 1024;

export class WSConnection extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket;
    this.buf = Buffer.alloc(0);
    this.frags = [];
    this.fragOp = 0;
    this.open = true;
    socket.setNoDelay(true);
    socket.on('data', (d) => this.onData(d));
    socket.on('close', () => this.finish());
    socket.on('error', () => this.finish());
    socket.on('end', () => this.finish());
  }

  finish() {
    if (!this.open) return;
    this.open = false;
    this.emit('close');
    try { this.socket.destroy(); } catch { /* ignore */ }
  }

  onData(d) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    if (this.buf.length > MAX_MESSAGE * 2) { this.close(1009); return; }
    while (this.open) {
      const b = this.buf;
      if (b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0;
      const op = b[0] & 0x0f;
      const masked = (b[1] & 0x80) !== 0;
      let len = b[1] & 0x7f;
      let off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) {
        if (b.length < 10) return;
        const hi = b.readUInt32BE(2), lo = b.readUInt32BE(6);
        if (hi !== 0) { this.close(1009); return; }
        len = lo; off = 10;
      }
      if (len > MAX_MESSAGE) { this.close(1009); return; }
      if (!masked) { this.close(1002); return; } // clients must mask
      if (b.length < off + 4 + len) return;
      const mask = b.subarray(off, off + 4);
      off += 4;
      const payload = Buffer.allocUnsafe(len);
      for (let i = 0; i < len; i++) payload[i] = b[off + i] ^ mask[i & 3];
      this.buf = b.subarray(off + len);
      this.onFrame(fin, op, payload);
    }
  }

  onFrame(fin, op, payload) {
    switch (op) {
      case 0x0: // continuation
        if (!this.fragOp) { this.close(1002); return; }
        this.frags.push(payload);
        if (fin) {
          const all = Buffer.concat(this.frags);
          const fop = this.fragOp;
          this.frags = []; this.fragOp = 0;
          if (all.length > MAX_MESSAGE) { this.close(1009); return; }
          if (fop === 0x1) this.emit('message', all.toString('utf8'));
        }
        break;
      case 0x1: case 0x2:
        if (!fin) { this.fragOp = op; this.frags = [payload]; return; }
        if (op === 0x1) this.emit('message', payload.toString('utf8'));
        break;
      case 0x8: this.close(1000); break;
      case 0x9: this.sendFrame(0xA, payload); break;
      case 0xA: break;
      default: this.close(1002);
    }
  }

  sendFrame(op, payload) {
    if (!this.open) return;
    const len = payload.length;
    let header;
    if (len < 126) { header = Buffer.from([0x80 | op, len]); }
    else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x80 | op; header[1] = 126; header.writeUInt16BE(len, 2); }
    else { header = Buffer.alloc(10); header[0] = 0x80 | op; header[1] = 127; header.writeUInt32BE(0, 2); header.writeUInt32BE(len, 6); }
    try { this.socket.write(Buffer.concat([header, payload])); } catch { this.finish(); }
  }

  send(text) { this.sendFrame(0x1, Buffer.from(text, 'utf8')); }

  get backlog() { return this.socket.writableLength || 0; }

  close(code = 1000) {
    if (!this.open) return;
    const p = Buffer.alloc(2);
    p.writeUInt16BE(code, 0);
    this.sendFrame(0x8, p);
    setTimeout(() => this.finish(), 50);
  }
}

// Attach to an http.Server. onConnection(conn, req) is called for each accepted socket.
export function attachWebSocket(server, path, onConnection) {
  server.on('upgrade', (req, socket) => {
    const url = new URL(req.url, 'http://x');
    const key = req.headers['sec-websocket-key'];
    if (url.pathname !== path || !key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') {
      socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    onConnection(new WSConnection(socket), req);
  });
}
