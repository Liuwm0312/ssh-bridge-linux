const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');
const { spawn } = require('node:child_process');

const sourcePath = path.resolve(__dirname, '../scripts/ssh-bridge-linux-server.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const helperPath = path.resolve(__dirname, '../scripts/pty-ssh-bridge.py');

function harness(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ssh-bridge-security-'));
  const stdin = new PassThrough();
  const children = [];
  const messages = [];
  const writes = [];
  const mockProcess = Object.assign(new EventEmitter(), {
    platform: 'linux', env: options.env || {}, stdin,
    stdout: {write: text => messages.push(String(text))}
  });
  function startChild() {
    if (options.program) {
      const python = process.env.PYTHON || 'python3';
      const child = spawn(python, [helperPath, '--', python, '-u', '-c', options.program],
        {stdio:['pipe', 'pipe', 'pipe']});
      children.push(child);
      return child;
    }
    const child = Object.assign(new EventEmitter(), {
      pid: 1234, stdout: new PassThrough(), stderr: new PassThrough(),
      stdin: new Writable({write(chunk, encoding, callback) { writes.push(chunk.toString()); callback(); }}),
      kill() { this.emit('exit', 0, null); this.emit('close', 0, null); }
    });
    children.push(child);
    return child;
  }
  const context = vm.createContext({
    require(name) {
      if (name === 'node:child_process') return {spawn: startChild, spawnSync() { throw new Error('Unexpected batch command'); }};
      if (name === 'node:os') return {...os, homedir: () => root};
      return require(name);
    },
    __dirname: path.join(root, 'scripts'), process: mockProcess,
    Buffer, setTimeout, clearTimeout, console
  });
  vm.runInContext(source, context, {filename:sourcePath});
  const api = vm.runInContext('({openTerminal, sendInput, typeAndWait, runVisible, sendKey, readOutput, readScreen, toolSessionRecord, toolSessionReplay})', context);
  t.after(() => {
    for (const child of children) child.kill('SIGTERM');
    fs.rmSync(root, {recursive:true, force:true});
  });
  return {root, api, stdin, children, messages, writes,
    open() {
      api.openTerminal({session:'test', host:'203.0.113.10', user:'devops'});
      const session = vm.runInContext('sessions.get("test")', context);
      session.mirror.enabled = true;
      return session;
    }
  };
}

function exported(h, session) {
  return [h.api.readOutput({session:'test'}).text,
    h.api.readScreen({session:'test'}).screen.text,
    h.api.toolSessionRecord({session:'test'}).exportText,
    h.api.toolSessionReplay({session:'test'}).exportText,
    fs.readFileSync(session.mirror.filePath, 'utf8'),
    JSON.stringify(session.events), JSON.stringify(h.api.readOutput({session:'test'}))].join('\n');
}

test('raw input is not recorded or mirrored by default; bytes still reach the PTY', t => {
  const h = harness(t), session = h.open();
  const secret = 'synthetic-raw-input';
  h.api.sendInput({session:'test', input:secret+'\n'});
  assert.equal(h.writes.join(''), secret+'\n');
  assert.equal(exported(h, session).includes(secret), false);
  assert.equal(session.events.length, 0);
});

test('sensitive input overrides explicit logging and redacts literal echoes everywhere', t => {
  const h = harness(t), session = h.open();
  const secret = 'synthetic-sensitive-value';
  h.api.sendInput({session:'test', input:secret+'\n', sensitive:true, mirror:true, recordInput:true});
  h.children[0].stdout.write('echo: '+secret+'\r\n');
  assert.equal(h.writes.join(''), secret+'\n');
  assert.equal(exported(h, session).includes(secret), false);
  assert.match(h.api.readOutput({session:'test'}).text, /\[REDACTED\]/);
  assert.equal(session.events.some(event => event.type === 'input'), false);
});

for (const prompt of ['devops@example password: ', '[sudo] password for devops: ',
  "Enter passphrase for key '/tmp/example': ", '\u8bf7\u8f93\u5165\u5bc6\u7801\uff1a', '\x1b[31mPassword:\x1b[0m ']) {
  test('password prompt protects input: '+JSON.stringify(prompt), t => {
    const h = harness(t), session = h.open();
    const secret = 'synthetic-prompt-response';
    h.children[0].stdout.write(prompt);
    h.api.sendInput({session:'test', input:secret+'\n', sensitive:false, mirror:true, recordInput:true});
    h.children[0].stdout.write(secret+'\r\n');
    assert.equal(exported(h, session).includes(secret), false);
    assert.equal(session.events.some(event => event.type === 'input'), false);
  });
}

test('ordinary visible commands, raw logging opt-ins, and named keys still work', async t => {
  const h = harness(t), session = h.open();
  h.children[0].stdout.write('devops@example:~$ ');
  await h.api.runVisible({session:'test', command:'pwd', timeoutMs:0});
  h.api.sendInput({session:'test', input:'ls\n', mirror:true, recordInput:true});
  h.api.sendKey({session:'test', key:'enter'});
  assert.deepEqual(h.writes, ['pwd\n', 'ls\n', '\r']);
  assert.match(fs.readFileSync(session.mirror.filePath,'utf8'), /\$ pwd/);
  assert.match(h.api.toolSessionReplay({session:'test'}).exportText, /pwd/);
  assert.equal(session.events.filter(event => event.type === 'input').length, 2);
});

test('type-and-wait forwards sensitive and raw-input logging flags', async t => {
  const h = harness(t), session = h.open();
  const secret = 'synthetic-wait-value';
  await h.api.typeAndWait({session:'test', input:secret+'\n', sensitive:true,
    mirror:true, recordInput:true, timeoutMs:0});
  h.children[0].stdout.write(secret+'\n');
  assert.equal(exported(h, session).includes(secret), false);
  await h.api.typeAndWait({session:'test', input:'menu-choice\n', timeoutMs:0});
  assert.equal(session.events.some(event => event.type === 'input'), false);
});

test('visible sensitive commands and auto-detected password replies are not logged', async t => {
  const h = harness(t), session = h.open();
  const command = 'echo synthetic-command-value';
  await h.api.runVisible({session:'test', command, sensitive:true, timeoutMs:0});
  h.children[0].stdout.write(command+'\r\nPassword: ');
  await h.api.runVisible({session:'test', command:'synthetic-visible-reply', timeoutMs:0});
  assert.equal(exported(h, session).includes(command), false);
  assert.equal(exported(h, session).includes('synthetic-visible-reply'), false);
});

test('chunk-split echoes and UTF-8 byte fragments cannot leak into any export', t => {
  const h = harness(t), session = h.open();
  const secret = 'synthetic-\u79d8\u5bc6-value';
  h.api.sendInput({session:'test', input:secret+'\n', sensitive:true});
  const bytes = Buffer.from('before '+secret+' after\r\n');
  for (const byte of bytes) h.children[0].stdout.write(Buffer.from([byte]));
  for (const fragment of ['stderr ', secret.slice(0,5), secret.slice(5), ' done']) h.children[0].stderr.write(fragment);
  const text = exported(h, session);
  assert.equal(text.includes(secret), false);
  assert.match(h.api.readOutput({session:'test'}).text, /before \[REDACTED\] after/);
  assert.match(h.api.readOutput({session:'test'}).text, /stderr \[REDACTED\] done/);
});

test('a previously protected value is not reintroduced by later visible command input', async t => {
  const h = harness(t), session = h.open();
  const secret = 'synthetic-reused-value';
  h.api.sendInput({session:'test', input:secret+'\n', sensitive:true});
  await h.api.runVisible({session:'test', command:'echo '+secret, timeoutMs:0});
  h.children[0].stdout.write('echo '+secret+'\r\n');
  assert.equal(exported(h, session).includes(secret), false);
  assert.equal(session.events.some(event => event.type === 'input'), false);
});

test('overlapping secrets remain protected across chunks and partial output at process close', t => {
  const h = harness(t), session = h.open();
  for (const input of ['synthetic', 'synthetic-overlap']) h.api.sendInput({session:'test', input:input+'\n', sensitive:true});
  h.children[0].stdout.write('synthetic');
  assert.equal(h.api.readOutput({session:'test'}).text, '');
  h.children[0].stdout.write('-overlap finished\n');
  h.children[0].stderr.write('trailing synthe');
  h.children[0].emit('exit', 0, null);
  h.children[0].emit('close', 0, null);
  const text = h.api.readOutput({session:'test'}).text;
  assert.match(text, /\[REDACTED\] finished/);
  assert.match(text, /trailing \[REDACTED\]/);
  assert.equal(text.includes('synthe'), false);
  assert.equal(session.privacy, null);
});

test('mirror files are private and newly created files cannot collide', t => {
  const h = harness(t), session = h.open();
  for (const dir of [path.join(h.root,'state'), path.dirname(session.mirror.filePath)]) {
    assert.equal(fs.statSync(dir).mode & 0o777, 0o700);
  }
  assert.equal(fs.statSync(session.mirror.filePath).mode & 0o777, 0o600);
  h.api.openTerminal({session:'test-2', host:'203.0.113.10', user:'devops'});
  assert.equal(fs.readdirSync(path.dirname(session.mirror.filePath)).length, 2);
});

function frame(message, mode) {
  const body = JSON.stringify(message);
  return mode === 'header' ? `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}` : body+'\n';
}

async function rpc(h, message, mode = 'newline', expected = mode) {
  h.messages.length = 0;
  const value = Buffer.from(frame(message, mode));
  for (let i=0; i<value.length; i+=7) h.stdin.write(value.subarray(i,i+7));
  await new Promise(resolve => setImmediate(resolve));
  const output = h.messages.join('');
  if (expected === 'header') {
    const [header, body] = output.split('\r\n\r\n');
    assert.equal(Number(header.match(/Content-Length: (\d+)/)[1]), Buffer.byteLength(body));
    return JSON.parse(body);
  }
  assert.equal(output.startsWith('Content-Length:'), false);
  return JSON.parse(output);
}

for (const mode of ['newline', 'header']) {
  test('MCP '+mode+' framing and tool dispatch preserve input privacy', async t => {
    const h = harness(t), session = h.open();
    const init = await rpc(h, {jsonrpc:'2.0', id:1, method:'initialize'}, mode);
    assert.equal(init.result.serverInfo.version, '0.8.1');
    const list = await rpc(h, {jsonrpc:'2.0', id:2, method:'tools/list'}, mode);
    for (const name of ['ssh_linux_send', 'ssh_linux_type_and_wait', 'ssh_linux_run_visible']) {
      assert.equal(list.result.tools.find(tool=>tool.name===name).inputSchema.properties.sensitive.type, 'boolean');
    }
    const secret = 'synthetic-mcp-value';
    const reply = await rpc(h, {jsonrpc:'2.0', id:3, method:'tools/call',
      params:{name:'ssh_linux_send', arguments:{session:'test', input:secret+'\n', sensitive:true, mirror:true, recordInput:true}}}, mode);
    assert.equal(reply.result.isError, false);
    assert.equal(JSON.stringify(reply).includes(secret), false);
    h.children[0].stdout.write(secret+'\n');
    const replay = await rpc(h, {jsonrpc:'2.0', id:4, method:'tools/call',
      params:{name:'ssh_linux_session_replay', arguments:{session:'test'}}}, mode);
    assert.equal(JSON.stringify(replay).includes(secret), false);
    assert.equal(exported(h, session).includes(secret), false);
  });
}

test('MCP reply format overrides remain available', async t => {
  for (const expected of ['newline', 'header']) {
    const h = harness(t, {env:{SSH_BRIDGE_LINUX_STDIO_FRAMING:expected}});
    const reply = await rpc(h, {jsonrpc:'2.0', id:1, method:'initialize'}, expected === 'newline' ? 'header' : 'newline', expected);
    assert.equal(reply.id, 1);
  }
});

test('real Python PTY password interaction preserves delivery without retaining the secret', {timeout:10000}, async t => {
  const program = [
    'import sys, termios, hashlib',
    'attrs = termios.tcgetattr(sys.stdin.fileno())',
    'attrs[3] &= ~termios.ECHO',
    'termios.tcsetattr(sys.stdin.fileno(), termios.TCSANOW, attrs)',
    'print("Password: ", end="", flush=True)',
    'value = input()',
    'print("received-sha256=" + hashlib.sha256(value.encode()).hexdigest(), flush=True)',
    'print("literal-echo=" + value, flush=True)'
  ].join('\n');
  const h = harness(t, {program}), session = h.open();
  const child = h.children[0];
  const closed = new Promise((resolve,reject) => {child.once('close',resolve);child.once('error',reject);});
  const deadline = Date.now()+5000;
  while (!h.api.readOutput({session:'test'}).text.includes('Password: ')) {
    assert.ok(Date.now()<deadline, 'PTY did not produce a prompt');
    await new Promise(resolve => setTimeout(resolve,10));
  }
  const secret = 'synthetic-real-pty-value';
  h.api.sendInput({session:'test', input:secret+'\n', mirror:true, recordInput:true});
  await closed;
  const digest = require('node:crypto').createHash('sha256').update(secret).digest('hex');
  assert.match(h.api.readOutput({session:'test'}).text, new RegExp('received-sha256='+digest));
  assert.match(h.api.readOutput({session:'test'}).text, /literal-echo=\[REDACTED\]/);
  assert.equal(exported(h, session).includes(secret), false);
});
