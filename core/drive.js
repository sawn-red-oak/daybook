"use strict";
/* Google Drive: sign-in, data sync, and saving documents.

   Everything lives in a "Radicchio" folder in the person's own Drive:
     Radicchio/radicchio-data.json     the data, kept in sync between devices
     Radicchio/Invoices/<client>/…      invoices and work reports
     Radicchio/Quotes/<client>/…        quotes
   The app asks only for the drive.file permission, so it can see the files it
   created and nothing else in the person's Drive.

   Sign-in uses Google Identity Services in the browser. Its access tokens last
   an hour and can only be renewed from a tap (Google shows a popup), so when
   one runs out the header says "tap to sync" and changes wait on the device
   until then. Nothing is lost.

   Sync: read Drive's copy, merge it with this device's (core/merge.js), write
   the result back. It runs on start, a few seconds after each change, when
   the app comes back to the foreground or online, and as it goes to the
   background. It is off unless config.js has a googleClientId. */

var DRIVE_SCOPE="https://www.googleapis.com/auth/drive.file";
var DRIVE_FILE="radicchio-data.json";
var DRIVE_ROOT=(window.CONFIG&&CONFIG.driveFolder)||"Radicchio";   /* config.js can rename the folder */
var LSDRIVE="radicchio.drive", LSTOKEN="radicchio.token", LSBASE="radicchio.base";
var DRV={state:{}, token:null, exp:0, busy:false, again:false, status:"off", timer:null, gis:null, tc:null};

function driveConfigured(){ return !!(window.CONFIG&&CONFIG.googleClientId) }
function driveOn(){ return driveConfigured()&&!!DRV.state.email }
function driveLoad(){
  try{ DRV.state=JSON.parse(localStorage.getItem(LSDRIVE)||"{}")||{} }catch(e){ DRV.state={} }
  try{ var t=JSON.parse(localStorage.getItem(LSTOKEN)||"null"); if(t&&t.exp>Date.now()){ DRV.token=t.token; DRV.exp=t.exp } }catch(e){}
}
function driveSaveState(){ try{ localStorage.setItem(LSDRIVE,JSON.stringify(DRV.state)) }catch(e){} }
function driveSetStatus(s){ DRV.status=s; if(typeof paintNet==="function") paintNet() }

/* ---------- sign-in ---------- */
function gisLoad(){
  if(DRV.gis) return DRV.gis;
  DRV.gis=new Promise(function(res,rej){
    if(window.google&&google.accounts&&google.accounts.oauth2) return res();
    var s=document.createElement("script");
    s.src="https://accounts.google.com/gsi/client"; s.async=true;
    s.onload=function(){res()}; s.onerror=function(){DRV.gis=null; rej(new Error("couldn't reach Google"))};
    document.head.appendChild(s);
  });
  return DRV.gis;
}
/* Staying signed in. Where the app is hosted with its sign-in server
   (functions/api/google on Cloudflare Pages), connecting uses Google's code
   flow: the server keeps a refresh token in an HttpOnly cookie and hands out
   fresh hourly tokens with no tap. Elsewhere (e.g. GitHub Pages) the browser
   gets hourly tokens itself, and the header asks for a tap when one runs out. */
var GSERVER="./api/google/";
function serverReady(){
  if(DRV.server!=null) return Promise.resolve(DRV.server);
  return fetch(GSERVER+"ping",{cache:"no-store"}).then(function(r){return r.ok?r.json():null})
    .then(function(j){ DRV.server=!!(j&&j.ok); return DRV.server })
    .catch(function(){ DRV.server=false; return false });
}
function gpost(path,body){
  return fetch(GSERVER+path,{method:"POST",credentials:"same-origin",
    headers:{"Content-Type":"application/json","X-Radicchio":"1"},body:JSON.stringify(body||{})})
    .then(function(r){ return r.json().catch(function(){return {}}).then(function(j){ j._status=r.status; return j }) });
}
function keepToken(t,expiresIn){
  DRV.token=t; DRV.exp=Date.now()+(+expiresIn||3600)*1000;
  try{ localStorage.setItem(LSTOKEN,JSON.stringify({token:DRV.token,exp:DRV.exp})) }catch(e){}
  return t;
}
/* A token now, or a rejection with .tap when getting one needs the person to tap. */
function driveToken(interactive,consent){
  if(DRV.token&&DRV.exp-60000>Date.now()) return Promise.resolve(DRV.token);
  var tap=function(){ var e=new Error("needs a tap"); e.tap=true; return e };
  /* a remembered sign-in on the server: renew silently */
  var viaServer = DRV.state.remembered
    ? gpost("refresh").then(function(j){
        if(j.access_token) return keepToken(j.access_token,j.expires_in);
        DRV.state.remembered=false; driveSaveState(); throw tap();
      })
    : Promise.reject(tap());
  return viaServer.catch(function(e){
    if(!interactive) throw tap();
    return serverReady().then(function(srv){ return srv ? codeSignIn() : tokenSignIn(consent) });
  });
}
/* Code flow through the server: the refresh token stays server-side. */
function codeSignIn(){
  return gisLoad().then(function(){
    return new Promise(function(res,rej){
      var cfg={client_id:CONFIG.googleClientId, scope:DRIVE_SCOPE, ux_mode:"popup",
        callback:function(r){
          if(!r||r.error||!r.code){ rej(new Error((r&&r.error)||"sign-in failed")); return }
          gpost("token",{code:r.code,client_id:CONFIG.googleClientId}).then(function(j){
            if(!j.access_token){ rej(new Error(j.error||"sign-in failed")); return }
            DRV.state.remembered=!!j.remembered; driveSaveState();
            res(keepToken(j.access_token,j.expires_in));
          },rej);
        },
        error_callback:function(err){ rej(new Error((err&&err.type)||"sign-in closed")) }};
      if(DRV.state.email) cfg.login_hint=DRV.state.email;
      google.accounts.oauth2.initCodeClient(cfg).requestCode();
    });
  });
}
/* Plain browser sign-in: an hourly token, renewed with a tap. */
function tokenSignIn(consent){
  return gisLoad().then(function(){
    return new Promise(function(res,rej){
      var tc=google.accounts.oauth2.initTokenClient({
        client_id:CONFIG.googleClientId, scope:DRIVE_SCOPE,
        callback:function(r){
          if(!r||r.error||!r.access_token){ rej(new Error((r&&r.error)||"sign-in failed")); return }
          res(keepToken(r.access_token,r.expires_in));
        },
        error_callback:function(err){ rej(new Error((err&&err.type)||"sign-in closed")) }
      });
      var opts={prompt:consent?"consent":""};
      if(DRV.state.email) opts.login_hint=DRV.state.email;
      tc.requestAccessToken(opts);
    });
  });
}
function gfetch(url,opts){
  opts=opts||{}; opts.headers=Object.assign({},opts.headers||{},{Authorization:"Bearer "+DRV.token});
  return fetch(url,opts).then(function(r){
    if(r.status===401){ DRV.token=null; DRV.exp=0; try{localStorage.removeItem(LSTOKEN)}catch(e){}
      var e=new Error("signed out"); e.tap=!DRV.state.remembered; e.retry=!!DRV.state.remembered; throw e }
    if(!r.ok){ var e2=new Error("Drive said "+r.status); e2.status=r.status; throw e2 }
    return r;
  });
}
var GAPI="https://www.googleapis.com/drive/v3/files", GUP="https://www.googleapis.com/upload/drive/v3/files";
function gq(s){ return "'"+String(s).replace(/\\/g,"\\\\").replace(/'/g,"\\'")+"'" }
function gfind(name,parent,folder){
  var q="name="+gq(name)+" and "+gq(parent||"root")+" in parents and trashed=false"+
        (folder?" and mimeType='application/vnd.google-apps.folder'":"");
  return gfetch(GAPI+"?spaces=drive&pageSize=5&fields=files(id)&q="+encodeURIComponent(q))
    .then(function(r){return r.json()}).then(function(j){ return j.files&&j.files[0]?j.files[0].id:null });
}
function gmkdir(name,parent){
  return gfetch(GAPI+"?fields=id",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({name:name,mimeType:"application/vnd.google-apps.folder",parents:[parent||"root"]})})
    .then(function(r){return r.json()}).then(function(j){return j.id});
}
/* Folder ids are remembered, and found again if one is deleted or moved. */
function gfolder(parts){
  DRV.state.dirs=DRV.state.dirs||{};
  var path=[DRIVE_ROOT].concat(parts), chain=Promise.resolve(null);
  path.forEach(function(name,i){
    var key=path.slice(0,i+1).join("/");
    chain=chain.then(function(parent){
      if(DRV.state.dirs[key]) return DRV.state.dirs[key];
      return gfind(name,parent,true).then(function(id){ return id||gmkdir(name,parent) })
        .then(function(id){ DRV.state.dirs[key]=id; driveSaveState(); return id });
    });
  });
  return chain;
}
function gcreate(name,parent,text,mime){
  var b="radicchio"+Math.random().toString(36).slice(2);
  var body="--"+b+"\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"+
    JSON.stringify({name:name,parents:[parent],mimeType:mime})+"\r\n--"+b+"\r\nContent-Type: "+mime+"\r\n\r\n"+
    text+"\r\n--"+b+"--";
  return gfetch(GUP+"?uploadType=multipart&fields=id,version",{method:"POST",
    headers:{"Content-Type":"multipart/related; boundary="+b},body:body}).then(function(r){return r.json()});
}
function gupdate(id,text,mime){
  return gfetch(GUP+"/"+id+"?uploadType=media&fields=id,version",{method:"PATCH",
    headers:{"Content-Type":mime},body:text}).then(function(r){return r.json()});
}
function forgetDirs(){ DRV.state.dirs={}; DRV.state.fileId=null; driveSaveState() }

/* ---------- connect / disconnect ---------- */
function driveConnect(){
  if(!driveConfigured()) return;
  if(!navigator.onLine){ toast("connect to the internet first"); return }
  driveToken(true,true).then(function(){
    return gfetch("https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)")
      .then(function(r){return r.json()});
  }).then(function(j){
    DRV.state={email:(j.user&&j.user.emailAddress)||"your Google account",remembered:!!DRV.state.remembered}; driveSaveState();
    try{ localStorage.removeItem(LSBASE) }catch(e){}   /* first sync on this device combines */
    renderSetup(); return driveSync(true);
  }).catch(function(e){ toast("couldn't connect Google Drive — "+e.message) });
}
function driveDisconnect(){
  if(DRV.state.remembered) gpost("signout").catch(function(){});
  try{ if(DRV.token&&window.google&&google.accounts) google.accounts.oauth2.revoke(DRV.token,function(){}) }catch(e){}
  DRV.state={}; DRV.token=null; DRV.exp=0;
  ["radicchio.drive","radicchio.token","radicchio.base"].forEach(function(k){ try{localStorage.removeItem(k)}catch(e){} });
  driveSetStatus("off"); renderSetup(); toast("Google Drive disconnected — your data stays on this device");
}

/* ---------- sync ---------- */
function readBase(){ try{ var b=localStorage.getItem(LSBASE); return b?JSON.parse(b):null }catch(e){ return null } }
function writeBase(s){ try{ localStorage.setItem(LSBASE,JSON.stringify(s)) }catch(e){} }
function isEmptyData(s){
  if(Object.keys(s.clients||{}).length) return false;
  for(var mk in (s.months||{})) if(Object.keys(s.months[mk]).length) return false;
  return !Object.keys(s.invoices||{}).length&&!Object.keys(s.quotes||{}).length;
}
/* Make S the merged data without calling save(), which would start another sync. */
function adopt(m){
  var d=defaults();
  S.clients=m.clients||{}; S.business=Object.assign(d.business,m.business||{});
  S.settings=Object.assign(d.settings,m.settings||{}); S.active=m.active||null;
  S.months=m.months||{}; S.invoices=m.invoices||{}; S.quotes=m.quotes||{};
  S.qtemplates=m.qtemplates||{}; S.mods=m.mods||{};
  for(var k in m) if(!(k in d)) S[k]=m[k];
  migrate();
  try{ localStorage.setItem(LS,JSON.stringify(S)) }catch(e){}
}
function clone(o){ return JSON.parse(JSON.stringify(o)) }

function syncSoon(){
  if(!driveOn()) return;
  clearTimeout(DRV.timer); DRV.timer=setTimeout(function(){ driveSync(false) },3000);
}
function driveSync(interactive){
  if(!driveOn()) return Promise.resolve();
  if(!navigator.onLine){ driveSetStatus("offline"); return Promise.resolve() }
  if(DRV.busy){ DRV.again=true; return Promise.resolve() }
  DRV.busy=true; DRV.again=false; clearTimeout(DRV.timer); DRV.timer=null;
  var snap=clone(S), base=readBase(), folderId, changed=false;
  return driveToken(interactive).then(function(){
    driveSetStatus("syncing");
    return gfolder([]);
  }).then(function(fid){
    folderId=fid;
    if(DRV.state.fileId) return DRV.state.fileId;
    return gfind(DRIVE_FILE,folderId,false);
  }).then(function(fileId){
    if(!fileId) return null;
    return gfetch(GAPI+"/"+fileId+"?fields=id,version,trashed").then(function(r){return r.json()})
      .then(function(m){ return m.trashed?null:m })
      .catch(function(e){ if(e.status===404){ forgetDirs(); return null } throw e });
  }).then(function(meta){
    if(!meta){
      /* nothing on Drive yet: this device's data becomes the first copy */
      return gcreate(DRIVE_FILE,folderId,JSON.stringify(snap),"application/json").then(function(r){
        DRV.state.fileId=r.id; DRV.state.version=r.version; return snap;
      });
    }
    DRV.state.fileId=meta.id;
    var unchangedRemote = base && String(meta.version)===String(DRV.state.version);
    if(unchangedRemote && sameData(snap,base)) return null;          /* nothing to do */
    var remoteP = unchangedRemote ? Promise.resolve(base)
      : gfetch(GAPI+"/"+meta.id+"?alt=media").then(function(r){return r.json()});
    return remoteP.then(function(remote){
      var merged;
      if(!base){
        /* first sync on this device: keep everything from both, matching up
           the same work the way a backup import does */
        if(isEmptyData(snap)) merged=clone(remote);
        else{ applyBackup(remote,"merge"); merged=clone(S); snap=clone(merged) }
      }else merged=merge3(base,snap,remote);
      changed=!sameData(merged,snap);
      if(sameData(merged,remote)){ DRV.state.version=meta.version; return merged }
      return gupdate(meta.id,JSON.stringify(merged),"application/json").then(function(r){
        DRV.state.version=r.version; return merged;
      });
    });
  }).then(function(merged){
    if(merged){
      /* anything typed while the sync was running is kept: merge it on top */
      var now2=clone(S);
      if(!sameData(now2,snap)){ merged=merge3(snap,now2,merged); DRV.again=true }
      if(changed||DRV.again) adopt(merged);
      writeBase(merged);
    }
    DRV.state.lastSync=Date.now(); driveSaveState(); DRV.retried=false;
    driveSetStatus("synced");
    if(changed){ renderAll(); if(UI.sheet) paintSheet() }
  }).catch(function(e){
    /* a remembered device whose hourly token was rejected: renew and go again */
    if(e.retry&&!DRV.retried){ DRV.retried=true; DRV.again=true; return }
    driveSetStatus(e.tap?"tap":"error");
    if(interactive&&!e.tap) toast("sync failed — "+e.message);
  }).then(function(){
    DRV.busy=false;
    if(DRV.again) syncSoon();
  });
}

/* ---------- documents ---------- */
/* Saves a file into Radicchio/<parts…>; replaces one of the same name. */
function driveSaveFile(parts,text,mime){
  var name=parts[parts.length-1];
  return driveToken(true).then(function(){ return gfolder(parts.slice(0,-1)) }).then(function(dir){
    return gfind(name,dir,false).then(function(id){
      return id ? gupdate(id,text,mime) : gcreate(name,dir,text,mime);
    });
  });
}

/* ---------- setup tab ---------- */
function renderDrive(){
  var sec=$("#driveSec"); if(!sec) return;
  sec.hidden=!driveConfigured();
  var row=$("#driveRow"); row.innerHTML="";
  if(!driveConfigured()) return;
  if(!driveOn()){
    var b=el("button","btn","connect google drive"); b.onclick=driveConnect; row.appendChild(b);
    row.appendChild(el("div","note","Keeps this device in sync with your other devices through a “"+DRIVE_ROOT+"” folder in your Google Drive, and saves invoices and quotes there. The app can only see the files it makes."));
    return;
  }
  var d=el("div"); d.style.display="flex"; d.style.justifyContent="space-between"; d.style.gap="10px"; d.style.alignItems="center";
  d.appendChild(el("span",null,DRV.state.email));
  var sn=el("button","btn bare","sync now"); sn.onclick=function(){ driveSync(true) }; d.appendChild(sn);
  row.appendChild(d);
  var when=DRV.state.lastSync?("Last synced "+t12(DRV.state.lastSync)+(ymd(DRV.state.lastSync)!==ymd(now())?" on "+dlong(DRV.state.lastSync):"")+"."):"Not synced yet.";
  row.appendChild(el("div","note",when+" Data and documents go to "+DRIVE_ROOT+"/ in this account's Drive."+
    (DRV.state.remembered?" This device stays signed in.":" Sign-in lasts an hour; after that, tap the header to sync.")));
  var off=el("button","btn bare","disconnect");
  off.onclick=function(){ if(!off.dataset.armed){off.dataset.armed="1";off.textContent="disconnect — tap again";return} driveDisconnect() };
  row.appendChild(off);
}
