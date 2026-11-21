'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const policy = require('../app/assets/js/url-policy.js');
const launch = require('../app/assets/js/launch.js');
const sandbox = require('../app/assets/js/install-sandbox.js');

for (const url of ['javascript:alert(1)', 'data:text/html,hi', '#', '', 'file:///tmp/test']) {
    assert.equal(policy.resolvePlayUrl(url, 'https://example.org/app/'), null, url);
}
assert.equal(policy.resolvePlayUrl('./mc/client/', 'https://example.org/app/').href, 'https://example.org/app/mc/client/');
assert.equal(policy.isSourceUrl('<html>hello</html>'), false);
assert.equal(policy.isSourceUrl('https://example.org/game'), true);
assert.equal(policy.isSourceUrl('javascript:alert(1)'), false);

let opened = [];
const win = { location: { href: 'https://example.org/app/' }, open: (href) => { opened.push(href); return { opener: win }; } };
win.self = win; win.top = win;
const doc = { getElementById: () => ({ getAttribute: () => 'javascript:alert(1)' }) };
const controller = launch.create({ window: win, document: doc });
assert.equal(controller.launch('tab').ok, false);
assert.equal(controller.launchOrNavigate('javascript:alert(1)'), false);
assert.deepEqual(opened, []);
assert.equal(sandbox.SANDBOX_FLAGS.includes('allow-same-origin'), false);
assert.equal(sandbox.SANDBOX_FLAGS.includes('allow-popups-to-escape-sandbox'), false);
const seed = { test: '</script><script>bad()</script>' };
const source = sandbox.shimSource('</script>', seed);
assert.equal(source.toLowerCase().includes('</script>'), false);
const messages = [];
const context = { window: {}, parent: { postMessage: (...args) => messages.push(args) } };
vm.runInNewContext(source, context);
assert.equal(context.window.localStorage.getItem('test'), seed.test);
context.window.localStorage.setItem('hello', 'world');
assert.equal(messages[0][0].snapshot.hello, 'world');
assert.ok(sandbox.buildSandboxPage('blob:https://example.org/123', 'id').includes('event.source!==document.getElementById'));
assert.ok(sandbox.instrumentHtml('<html><head><title>x</title></head></html>', { scope: 'id' }).indexOf('<script>') < sandbox.instrumentHtml('<html><head><title>x</title></head></html>', { scope: 'id' }).indexOf('<title>'));
console.log('Security regression tests passed');
