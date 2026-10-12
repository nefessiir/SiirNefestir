/* Şiir Nefestir – çevrimdışı çalışma: kitap (index.html) önce ağdan, olmazsa önbellekten;
   ses/video dosyaları önbellekte varsa oradan (Range destekli), yoksa ağdan gelir ve arka planda saklanır. */
const SURUM = "nefes-v1";
const CEKIRDEK = ["./", "./index.html", "./manifest.webmanifest", "./ikon/ikon-192.png", "./ikon/ikon-512.png", "./ikon/apple-touch-icon.png"];
const bekleyen = new Set();

self.addEventListener("install", function(e){
  e.waitUntil(caches.open(SURUM).then(function(c){ return Promise.all(CEKIRDEK.map(function(u){ return c.add(u).catch(function(){}); })); }).then(function(){ return self.skipWaiting(); }));
});
self.addEventListener("activate", function(e){
  e.waitUntil(caches.keys().then(function(k){ return Promise.all(k.filter(function(x){ return x !== SURUM; }).map(function(x){ return caches.delete(x); })); }).then(function(){ return self.clients.claim(); }));
});

async function aralikli(r, aralik){
  const buf = await r.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(aralik);
  let bas = m[1] === "" ? Math.max(0, buf.byteLength - parseInt(m[2], 10)) : parseInt(m[1], 10);
  let son = (m[1] === "" || m[2] === "") ? buf.byteLength - 1 : Math.min(parseInt(m[2], 10), buf.byteLength - 1);
  if(isNaN(bas) || bas > son){ return new Response(null, {status: 416, headers: {"Content-Range": "bytes */" + buf.byteLength}}); }
  return new Response(buf.slice(bas, son + 1), {status: 206, headers: {
    "Content-Type": r.headers.get("Content-Type") || "application/octet-stream",
    "Content-Length": String(son - bas + 1),
    "Content-Range": "bytes " + bas + "-" + son + "/" + buf.byteLength,
    "Accept-Ranges": "bytes"}});
}

self.addEventListener("fetch", function(e){
  const req = e.request;
  if(req.method !== "GET"){ return; }
  const url = new URL(req.url);
  if(url.origin !== location.origin){ return; }
  const medya = /\.(mp3|mp4|m4a|webm)$/i.test(url.pathname);

  if(medya){
    e.respondWith((async function(){
      const c = await caches.open(SURUM);
      const hit = await c.match(url.pathname, {ignoreSearch: true});
      if(hit){ const ar = req.headers.get("range"); return ar ? aralikli(hit, ar) : hit; }
      if(!bekleyen.has(url.href)){
        bekleyen.add(url.href);
        e.waitUntil(fetch(url.href).then(function(r){ if(r && r.ok){ return c.put(url.pathname, r); } }).catch(function(){}).then(function(){ bekleyen.delete(url.href); }));
      }
      return fetch(req);
    })());
    return;
  }

  /* sayfa ve diğer dosyalar: önce ağ (güncellemeler hemen gelsin), olmazsa önbellek */
  e.respondWith((async function(){
    const c = await caches.open(SURUM);
    try{
      const r = await fetch(req);
      if(r && r.ok && r.type === "basic"){ c.put(req, r.clone()); }
      return r;
    }catch(err){
      const hit = await c.match(req, {ignoreSearch: true}) || (req.mode === "navigate" ? await c.match("./index.html") : null);
      if(hit){ return hit; }
      throw err;
    }
  })());
});
