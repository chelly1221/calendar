import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const files=[];
async function walk(dir){for(const item of await fs.readdir(dir,{withFileTypes:true})){const name=path.join(dir,item.name);if(item.isDirectory())await walk(name);else if(!/\.(gz|br)$/.test(name)&&!name.endsWith('sw.js'))files.push('/'+path.relative('dist',name).replaceAll('\\','/'));}}
await walk('dist');const digest=createHash('sha256');for(const name of files.slice().sort())digest.update(await fs.readFile('dist'+name));const version=digest.digest('hex').slice(0,12);
await fs.writeFile('dist/sw.js',`const CACHE='calendar-${version}';const FILES=${JSON.stringify(files)};
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES))));
self.addEventListener('message',e=>{if(e.data==='ACTIVATE_UPDATE')self.skipWaiting();});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('calendar-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin||u.pathname.startsWith('/api/')||u.pathname.startsWith('/dav/')||u.pathname.startsWith('/downloads/'))return;if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).catch(()=>caches.match('/index.html')));return;}if(FILES.includes(u.pathname))e.respondWith(caches.match(u.pathname).then(r=>r||fetch(e.request)));});`);
console.log('Versioned offline shell ready:',version);
