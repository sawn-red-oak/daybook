"use strict";
/* The data: one object S, kept in localStorage. Clients, time blocks by month,
   invoices, quotes. Also invoice numbering and hour rounding. */

var VERSION="1.20.0";
var LS="radicchio.v1", LSUI="radicchio.ui";
/* Until v1.16 the app was called Daybook and kept its data under these keys.
   They are copied across once and then left alone, as a safety net. */
var OLD_LS="daybook.v1", OLD_LSUI="daybook.ui", OLD_SEEN="radicchio.daybook-seen";

/* ---------- state ---------- */
function defaults(){return{
  clients:{},
  business:{name:"",email:"",phone:"",address:"",terms:""},
  settings:{round:6,roundMode:"nearest",prefix:"",next:1,net:14,currency:"$",place:"onsite",
    invoiceDir:"Radicchio Invoices",dataDir:"Radicchio Data",quoteDir:"Radicchio Quotes",
    quoteValid:30, filePrefix:""},
  active:null, months:{}, invoices:{}, quotes:{}, qtemplates:{},
  mods:{}   /* each module's own data, by module id: see modData() */
}}
var S=defaults();
var UI={tab:"track",sheet:null};

function save(){try{localStorage.setItem(LS,JSON.stringify(S))}catch(e){}; folderAutoSave(); if(typeof syncSoon==="function") syncSoon()}
function saveUI(){try{localStorage.setItem(LSUI,JSON.stringify(UI))}catch(e){}}
function load(){
  adoptDaybook();
  try{var r=localStorage.getItem(LS); if(r){var p=JSON.parse(r);
    if(p&&typeof p==="object"){
      S.clients=p.clients||{};
      S.business=Object.assign(defaults().business,p.business||{});
      S.settings=Object.assign(defaults().settings,p.settings||{});
      S.active=p.active||null; S.months=p.months||{}; S.invoices=p.invoices||{};
      S.quotes=p.quotes||{}; S.qtemplates=p.qtemplates||{};
      S.mods=p.mods||{};
    }}}catch(e){}
  try{var u=localStorage.getItem(LSUI); if(u){var q=JSON.parse(u); if(q&&typeof q==="object") UI=Object.assign(UI,q)}}catch(e){}
  /* Any store key the running build expects must exist before the first
     render. A build that adds a key and forgets its default crashes on
     boot for anyone with no saved data — which is exactly what a cleared
     browser looks like. */
  var base=defaults();
  for(var k in base) if(S[k]===undefined||S[k]===null&&base[k]!==null) S[k]=base[k];
  migrate();
  catchUpDaybook();
}
/* First run after the rename: take over the Daybook data and screen state. */
function adoptDaybook(){
  try{
    if(localStorage.getItem(LS)==null){
      var o=localStorage.getItem(OLD_LS);
      if(o!=null){ localStorage.setItem(LS,o); localStorage.setItem(OLD_SEEN,o); }
    }
    if(localStorage.getItem(LSUI)==null){
      var u=localStorage.getItem(OLD_LSUI);
      if(u!=null) localStorage.setItem(LSUI,u);
    }
  }catch(e){}
}
/* An old Daybook copy of the app can still be cached on a phone, and on a slow
   connection the service worker may open it instead of this one. Anything it
   writes lands under the old key. When that key has changed since we last
   looked, merge it in with the same rules as a backup import: newer records
   win, and billed work is never un-invoiced. */
function catchUpDaybook(){
  try{
    var o=localStorage.getItem(OLD_LS);
    if(o==null||o===localStorage.getItem(OLD_SEEN)) return;
    var p=JSON.parse(o);
    if(p&&typeof p==="object") mergeBackup(p);
    localStorage.setItem(OLD_SEEN,o);
  }catch(e){}
}
/* old shape: a single `note` string per entry, no place, no tasks */
function migrate(){
  for(var k in S.months){var m=S.months[k];
    for(var id in m){var b=m[id]; if(!b) continue;
      if(!b.tasks){ b.tasks = b.note ? [{t:b.note,at:b.start}] : []; }
      delete b.note; delete b.taskId;
      if(!b.place) b.place=S.settings.place||"onsite";
    }}
  if(S.active){ if(!S.active.tasks) S.active.tasks=[]; if(!S.active.place) S.active.place=S.settings.place||"onsite"; }
  for(var cid in S.clients){ var c=S.clients[cid];
    if(c && c.prefix===undefined){
      c.prefix=S.settings.prefix||""; c.next=+S.settings.next||1; c.pad=3;
    }
    if(c && c.qprefix===undefined){
      c.qprefix=(c.prefix||"")+"Q"; c.qnext=1; c.qpad=3;
    }}
  /* invoices from before line items: freeze the client's rate and details on
     them, so changing a client later doesn't rewrite invoices already sent */
  for(var iid in S.invoices){ var iv=S.invoices[iid];
    if(iv&&!iv.snap&&!iv.report&&S.clients[iv.clientId]) iv.snap=snapFor(S.clients[iv.clientId]);
  }
}

/* ---------- records ---------- */
function putEntry(b){
  b.updatedAt=now();
  var k=monthKey(b.start);
  if(b._month&&b._month!==k&&S.months[b._month]) delete S.months[b._month][b.id];
  delete b._month;
  if(!S.months[k])S.months[k]={};
  S.months[k][b.id]=b; save();
}
function delEntry(b){var k=monthKey(b.start); if(S.months[k]) delete S.months[k][b.id]; save()}
function allEntries(){var o=[];for(var k in S.months){var m=S.months[k];
  for(var id in m){var b=m[id]; if(b&&b.end) o.push(b)}}
  o.sort(function(a,b){return b.start-a.start}); return o}
function liveClients(){return Object.keys(S.clients).map(function(k){return S.clients[k]})
  .filter(function(c){return !c.deleted}).sort(function(a,b){return a.name.localeCompare(b.name)})}
function clientName(id){var c=S.clients[id];return c?c.name:"—"}

function rawHours(b){return Math.max(0,b.end-b.start)/3600000}
function roundHours(h){var m=+S.settings.round||0; if(!m) return Math.round(h*10000)/10000;
  var step=m/60,n=h/step; n=(S.settings.roundMode==="up")?Math.ceil(n-1e-9):Math.round(n);
  return Math.round(n*step*10000)/10000}
function rateFor(b){var c=S.clients[b.clientId];return c&&c.rate?+c.rate:0}
function isInvoiced(b){return !!(b.invoiceId||b.invoiced)}
/* Invoice numbering is per client: a prefix, a counter, and a zero-pad
   width. The width is learned from whatever you actually type, so
   SK001 rolls to SK002 and SK0001 rolls to SK0002. */
function nextNumber(c){
  if(!c) return "";
  var pad=+c.pad||3, n=+c.next||1;
  return (c.prefix||"")+String(n).padStart(pad,"0");
}
function nextQuoteNumber(c){
  if(!c) return "";
  return (c.qprefix||"")+String(+c.qnext||1).padStart(+c.qpad||3,"0");
}
function advanceQuoteNumber(c,used){
  var m=/^(.*?)(\d+)\s*$/.exec(String(used||""));
  if(m){ c.qprefix=m[1]; c.qpad=m[2].length; c.qnext=parseInt(m[2],10)+1; }
  else { c.qnext=(+c.qnext||0)+1; }
  c.updatedAt=now(); S.clients[c.id]=c;
}
function advanceNumber(c,used){
  var m=/^(.*?)(\d+)\s*$/.exec(String(used||""));
  if(m){ c.prefix=m[1]; c.pad=m[2].length; c.next=parseInt(m[2],10)+1; }
  else { c.next=(+c.next||0)+1; }
  c.updatedAt=now(); S.clients[c.id]=c;
}
function invoiceLabel(b){
  if(b.invoiceId&&S.invoices[b.invoiceId])return "invoiced "+S.invoices[b.invoiceId].number;
  return isInvoiced(b)?"invoiced":""}
function amountFor(b){return Math.round(roundHours(rawHours(b))*rateFor(b)*100)/100}
function fmtH(h){return h.toFixed(2)}
function taskText(b){return (b.tasks||[]).map(function(t){return t.t}).filter(Boolean).join("; ")}
/* the place label sits at the front of the note, as it does in the CSV */
function noteText(b){var t=taskText(b); return placeLabel(b.place)+(t?" — "+t:"")}
