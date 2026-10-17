const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');

const files = execFileSync('git', ['ls-files', '-z'], {encoding:'utf8'}).split('\0').filter(Boolean);
assert.ok(files.length > 0, 'No tracked files to review');
const secretPatterns = [
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/
];
for (const file of files) {
  assert.ok(!/^data\//.test(file) || file === 'data/README.md', `Local data staged: ${file}`);
  assert.ok(!/\.(?:sqlite\d*|db)(?:-|$)|\.(?:pdf|xlsx?|csv|pem|key|p12|pfx|bak|backup)$/i.test(file), `Private file staged: ${file}`);
  assert.ok(!/(?:^|\/)\.env(?:$|\.)/.test(file) || file.endsWith('.env.example'), `Environment file staged: ${file}`);
  const content = execFileSync('git', ['show', `:${file}`], {maxBuffer:20 * 1024 * 1024});
  if (content.includes(0)) continue;
  const text = content.toString('utf8');
  assert.ok(!secretPatterns.some(pattern => pattern.test(text)), `Possible credential in ${file}`);
  if (!file.startsWith('dist/vendor/')) {
    assert.ok(!/C:[\\/]Users[\\/][^\s\\/]+[\\/]/i.test(text), `Personal computer path in ${file}`);
  }
}
assert.equal(execFileSync('git', ['check-ignore', 'data/diary.sqlite'], {encoding:'utf8'}).trim(), 'data/diary.sqlite');
console.log(`Public source check passed: ${files.length} tracked files; diary database excluded.`);
