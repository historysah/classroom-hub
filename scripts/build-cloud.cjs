const fs = require('node:fs');
const path = require('node:path');
const {buildSync} = require('esbuild');

const name = process.argv[2];
if (!['diary', 'qr'].includes(name)) throw new Error('Choose diary or qr');
const root = path.join(__dirname, '..');
const app = path.join(root, 'apps', name);
const output = path.join(app, 'public');
const configFile = path.join(app, 'config.public.json');
if (!fs.existsSync(configFile)) throw new Error(`Missing public app configuration: apps/${name}/config.public.json`);
const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
if (name === 'qr') {
  const url = new URL(config.supabaseUrl);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co')) throw new Error('Invalid Supabase public URL');
  const key = config.supabasePublishableKey || '';
  if (!key.startsWith('sb_publishable_')) {
    let claims;
    try {claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());} catch {}
    if (claims?.role !== 'anon') throw new Error('Only a Supabase publishable/anon key is allowed in frontend configuration');
  }
} else if (!config.firebase?.projectId || !config.firebase?.apiKey) throw new Error('Firebase public configuration is required');
fs.mkdirSync(output, {recursive:true});
fs.copyFileSync(path.join(app, 'index.html'), path.join(output, 'index.html'));
fs.copyFileSync(path.join(root, 'apps', 'shared', 'styles.css'), path.join(output, 'styles.css'));
fs.writeFileSync(path.join(output, 'config.js'), `window.CLOUD_CONFIG=${JSON.stringify(config)};\n`);
if (name === 'qr') {
  fs.copyFileSync(path.join(root, 'dist/vendor/qrcode/qrcode.js'), path.join(output, 'qrcode.js'));
}
buildSync({entryPoints:[path.join(app, 'app.js')], outfile:path.join(output, 'app.js'), bundle:true, minify:true, format:'iife', target:'es2022', legalComments:'eof'});
console.log(`Built ${name} app: apps/${name}/public`);
