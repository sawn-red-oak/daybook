"use strict";
/* Invoices tab, invoice documents, and the document viewer. */

/* ---------- render: invoices ---------- */
function renderInvoices(){
  var host=$("#invList");host.innerHTML="";
  var list=Object.keys(S.invoices).map(function(k){return S.invoices[k]})
    .sort(function(a,b){return (b.createdAt||0)-(a.createdAt||0)});
  if(!list.length){
    host.appendChild(el("div","empty","No invoices yet. Tap + new invoice, or select blocks on the blocks tab and generate one."));
    return;
  }
  var log=el("div","log");
  list.forEach(function(iv){
    var row=el("div","row"),body=el("div","body"),l1=el("div","l1");
    l1.appendChild(el("span",null,iv.number||"(no number)"));
    l1.appendChild(el("span","hrs",money(iv.total||0)));
    body.appendChild(l1);
    var what=[];
    if((iv.blockIds||[]).length) what.push((iv.hours||0).toFixed(2)+" h");
    var ni=(iv.items||[]).length; if(ni) what.push(ni+(ni===1?" item":" items"));
    body.appendChild(el("div","place",
      (S.clients[iv.clientId]?S.clients[iv.clientId].name:"—")+" · "+
      (what.length?what.join(" + ")+" · ":"")+"issued "+dateWords(iv.issued)));
    row.appendChild(body);
    row.onclick=function(){ openInvoice(iv) };
    row.tabIndex=0;
    row.onkeydown=function(e){if(e.key==="Enter"){e.preventDefault();openInvoice(iv)}};
    log.appendChild(row);
  });
  host.appendChild(log);
}
function openInvoice(iv){
  var blocks=(iv.blockIds||[]).map(function(id){
    for(var k in S.months) if(S.months[k][id]) return S.months[k][id];
    return null}).filter(Boolean);
  if(!blocks.length&&(iv.blockIds||[]).length&&!(iv.items||[]).length){toast("the blocks for this invoice are gone");return}
  showViewer(iv,invoiceClient(iv),blocks,false);
}

/* ---------- invoice records ----------
   An invoice is time blocks (blockIds) and/or line items (items), each item
   {desc, qty, unit, rate, source:"manual"|"print"|<a module's id>, date?, category?,
   file?}. The client's rate, name and address are frozen on the invoice when
   it's recorded (snap), so a later change to the client doesn't rewrite
   invoices already sent. */
function itemsTotal(items){
  return Math.round((items||[]).reduce(function(a,it){return a+itemAmount(it)},0)*100)/100;
}
function cleanItems(items){
  return (items||[]).filter(function(it){return (it.desc||"").trim()||itemAmount(it)})
    .map(function(it){return Object.assign({source:"manual"},it,{desc:(it.desc||"").trim()})});
}
function snapFor(c){
  c=c||{};
  return {rate:+c.rate||0, name:c.name||"", address:c.address||"", email:c.email||""};
}
/* The client as the invoice shows it: frozen details over the current record. */
function invoiceClient(iv){
  var c=S.clients[iv.clientId]||{name:"client"};
  return iv.snap?Object.assign({},c,{name:iv.snap.name||c.name,address:iv.snap.address,email:iv.snap.email}):c;
}
/* Store a composed invoice: id, frozen client details, number advanced,
   blocks linked. Returns the stored record. */
function recordInvoice(doc,client,blocks){
  var id=uid(), t=now();
  doc.id=id; doc.createdAt=t; doc.updatedAt=t;
  doc.snap=snapFor(client);
  doc.items=cleanItems(doc.items);
  S.invoices[id]=doc;
  advanceNumber(client,doc.number);
  (blocks||[]).forEach(function(b){b.invoiceId=id;putEntry(b)});
  save();
  return doc;
}
/* File names: "<prefix> Invoice SK007", "<prefix> Quote MPQ003",
   "<prefix> Report 2026-11-25 Sawkille Furniture". The prefix is a setting
   (e.g. your initials); without one the name starts at "Invoice". */
function docName(doc,client){
  var p=(S.settings.filePrefix||"").trim(), core;
  if(doc.quote) core="Quote "+(doc.number||"");
  else if(doc.report) core="Report "+ymd(now())+" "+(client.name||"");
  else core="Invoice "+(doc.number||"");
  return safeName((p?p+" ":"")+core);
}
function saveDocFile(doc,client,list,asCsv){
  var dir=doc.quote?(S.settings.quoteDir||"Radicchio Quotes"):(S.settings.invoiceDir||"Radicchio Invoices");
  var name=docName(doc,client)+(asCsv?".csv":".html");
  var cdir=safeName(client.name);
  deliver([safeName(dir),cdir,name],
    asCsv?toCsv(list):docFile(doc,client,list),
    asCsv?"text/csv;charset=utf-8":"text/html;charset=utf-8",
    [doc.quote?"Quotes":"Invoices",cdir,name]);
}

/* ---------------------------------------------------------
   The invoice is a facsimile of the log: day headers, block
   times, the notes as written, then the arithmetic. One CSS
   string serves both the in-app viewer and the saved file.
   --------------------------------------------------------- */
function docCss(){return [
".invsheet{max-width:760px;margin:0 auto;background:#fff;color:#111;border:1px solid #ddd;",
"  padding:40px 38px;font:13px/1.6 ui-monospace,'Cascadia Mono','Segoe UI Mono',Menlo,Consolas,monospace;",
"  font-variant-numeric:tabular-nums}",
"@media screen{.invsheet{min-height:900px;margin:16px auto 40px}}",
".invsheet header{display:flex;justify-content:space-between;gap:28px;align-items:flex-start;",
"  border-bottom:1px solid #111;padding-bottom:14px;background:transparent;color:#111;",
"  position:static;z-index:auto;padding-top:0}",
".invsheet,.invsheet *{text-transform:none}",
".invsheet .biz,.invsheet .tag h1,.invsheet .parties h2,.invsheet .period{",
"  text-transform:uppercase}",
".invsheet .biz{font-size:15px;font-weight:600;margin:0 0 4px;text-transform:uppercase;letter-spacing:.1em}",
".invsheet .small{font-size:11px;color:#666;white-space:pre-line;line-height:1.5}",
".invsheet .tag{text-align:right;flex:none}",
".invsheet .tag h1{margin:0 0 3px;font-size:10.5px;letter-spacing:.22em;text-transform:uppercase;",
"  color:#666;font-weight:400}",
".invsheet .tag .no{font-size:14px;font-weight:600}",
".invsheet .parties{margin:20px 0 0}",
".invsheet .parties h2{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#999;",
"  margin:0 0 4px;font-weight:400}",
".invsheet .period{margin-top:16px;padding-top:10px;border-top:1px solid #eee;font-size:11px;color:#666;",
"  text-transform:uppercase;letter-spacing:.08em}",
".invsheet .ilog{margin-top:6px}",
".invsheet .day{display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid #ccc;",
"  padding:14px 0 4px;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:#666}",
".invsheet .blk{padding:8px 0 9px;border-bottom:1px solid #f0f0f0}",
".invsheet .blk .l1{display:flex;justify-content:space-between;gap:10px;align-items:baseline}",
".invsheet .blk .tm{color:#333}",
".invsheet .blk .pl{color:#999;font-size:11px;flex:1;padding-left:10px}",
".invsheet .blk .hh{flex:none}",
".invsheet .blk ul{margin:4px 0 0;padding:0 0 0 2ch;list-style:none}",
".invsheet .blk li{position:relative;padding-left:1.2ch;",
"  font-size:11px;color:#666;line-height:1.5}",
".invsheet .blk li:before{content:'·';position:absolute;left:0;color:#bbb}",
".invsheet .blk .nn{margin-left:2ch;color:#bbb;font-size:11px}",
".invsheet .totals{margin-top:20px;display:flex;justify-content:flex-end}",
".invsheet .totals table{border-collapse:collapse;min-width:260px}",
".invsheet .totals td{padding:5px 0 5px 18px;text-align:right}",
".invsheet .totals td:first-child{text-align:left;padding-left:0;color:#666}",
".invsheet .totals .grand td{border-top:1px solid #111;font-size:15px;font-weight:600;padding-top:9px;color:#111}",
".invsheet .memo{margin-top:24px;border-top:1px solid #eee;padding-top:12px;font-size:11.5px;",
"  color:#444;white-space:pre-line}",
".invsheet .pv{background:#111;color:#fff;text-align:center;padding:5px;margin:-40px -38px 26px;",
"  font-size:10.5px;letter-spacing:.22em;text-transform:uppercase}",
".invsheet .qtitle{font-size:14px;font-weight:600;margin:18px 0 0}",
".invsheet .qtab{width:100%;border-collapse:collapse;margin-top:8px}",
".invsheet .qtab th{text-align:left;font-size:10px;letter-spacing:.14em;text-transform:uppercase;",
"  color:#999;font-weight:400;border-bottom:1px solid #ccc;padding:0 0 5px}",
".invsheet .qtab th.n,.invsheet .qtab td.n{text-align:right;white-space:nowrap;padding-left:16px}",
".invsheet .qtab td{padding:9px 0;border-bottom:1px solid #f0f0f0;vertical-align:top;font-size:12.5px}",
".invsheet .qtab td .u{color:#999;font-size:11px}",
".invsheet .qscope{margin:8px 0 0;padding:0;list-style:none}",
".invsheet .qscope li{position:relative;padding:3px 0 3px 1.6ch;font-size:12.5px}",
".invsheet .qscope li:before{content:'\\00b7';position:absolute;left:0;color:#aaa}",
".invsheet .qsec{margin-top:22px}",
".invsheet .qsec h2{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#999;",
"  margin:0 0 5px;font-weight:400}",
".invsheet .qsec .bd{font-size:11.5px;color:#444;white-space:pre-line}",
".invsheet .qsec ul{margin:0;padding:0;list-style:none}",
".invsheet .qsec li{position:relative;padding:2px 0 2px 1.6ch;font-size:11.5px;color:#444}",
".invsheet .qsec li:before{content:'\\00b7';position:absolute;left:0;color:#bbb}"
].join("\n")}

function rateGroups(list,rateOf){
  var g={};
  rateOf=rateOf||rateFor;
  list.forEach(function(b){
    var r=rateOf(b),k=String(r),h=roundHours(rawHours(b));
    if(!g[k])g[k]={rate:r,h:0,a:0};
    g[k].h+=h; g[k].a+=Math.round(h*r*100)/100;
  });
  return Object.keys(g).map(function(k){return g[k]}).sort(function(x,y){return y.rate-x.rate});
}

function docBody(doc,client,list,preview){
  var sorted=list.slice().sort(function(a,b){return a.start-b.start});
  var biz=S.business,rep=doc.report,fill=doc.desc||"";
  var cur=S.settings.currency||"$";
  function m(n){return cur+n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
  function bullets(tasks){
    if(!tasks||!tasks.length) return fill?'<div class="nn">'+esc(fill)+'</div>':'<div class="nn">&mdash;</div>';
    return "<ul>"+tasks.map(function(t){return "<li>"+esc(t.t)+"</li>"}).join("")+"</ul>";
  }
  function blockRow(tm,pl,h,body){
    return '<div class="blk"><div class="l1"><span class="tm">'+esc(tm)+'</span>'+
      '<span class="pl">'+esc(pl)+'</span><span class="hh">'+h.toFixed(2)+'</span></div>'+body+'</div>';
  }

  /* group into days, exactly as the app's log does */
  var days=[],byDay={};
  sorted.forEach(function(b){var k=ymd(b.start);
    if(!byDay[k]){byDay[k]={k:k,label:dlong(b.start),blocks:[],h:0};days.push(byDay[k])}
    byDay[k].blocks.push(b); byDay[k].h+=roundHours(rawHours(b))});

  var logHtml="";
  if(!sorted.length){
    logHtml="";
  }else if(doc.mode==="total"){
    var th=sorted.reduce(function(s2,b){return s2+roundHours(rawHours(b))},0);
    logHtml='<div class="day"><span>'+esc(dlong(sorted[0].start))+' &ndash; '+
      esc(dlong(sorted[sorted.length-1].start))+'</span><span>'+th.toFixed(2)+'</span></div>'+
      blockRow("",""
        ,th,fill?'<div class="nn">'+esc(fill)+'</div>':"");
  }else if(doc.mode==="day"){
    logHtml=days.map(function(d){
      var tasks=[];d.blocks.forEach(function(b){tasks=tasks.concat(b.tasks||[])});
      var pl={};d.blocks.forEach(function(b){pl[placeLabel(b.place).toLowerCase()]=1});
      var tms=d.blocks.map(function(b){return t12(b.start)+"–"+t12(b.end)}).join(", ");
      return '<div class="day"><span>'+esc(d.label)+'</span><span>'+d.h.toFixed(2)+'</span></div>'+
        blockRow(tms,Object.keys(pl).join(" / "),d.h,bullets(tasks));
    }).join("");
  }else{
    logHtml=days.map(function(d){
      return '<div class="day"><span>'+esc(d.label)+'</span><span>'+d.h.toFixed(2)+'</span></div>'+
        d.blocks.map(function(b){
          return blockRow(t12(b.start)+"–"+t12(b.end),placeLabel(b.place).toLowerCase(),
            roundHours(rawHours(b)),bullets(b.tasks));
        }).join("");
    }).join("");
  }

  var onsite=sorted.filter(function(b){return b.place!=="remote"}).length;
  var remote=sorted.length-onsite;
  /* the rate frozen on the invoice when it was recorded, if any */
  var rateOf=doc.snap&&doc.snap.rate!=null?function(){return +doc.snap.rate||0}:rateFor;
  var groups=rateGroups(sorted,rateOf);
  var items=rep?[]:(doc.items||[]).filter(function(it){return (it.desc||"").trim()||itemAmount(it)});
  var itemsAmt=itemsTotal(items);
  var timeAmt=Math.round(groups.reduce(function(a,g){return a+g.a},0)*100)/100;
  var totals="", grand='<tr class="grand"><td>Total due</td><td>'+m(doc.total)+'</td></tr>';
  if(rep){
    totals='<tr class="grand"><td>Hours</td><td>'+doc.hours.toFixed(2)+'</td></tr>';
  }else if(!sorted.length){
    totals=grand;                                   /* items only: the table says it all */
  }else if(groups.length===1&&groups[0].rate){
    totals='<tr><td>Hours</td><td>'+doc.hours.toFixed(2)+'</td></tr>'+
           '<tr><td>Rate</td><td>'+m(groups[0].rate)+' / h</td></tr>'+
           (items.length?'<tr><td>Time</td><td>'+m(timeAmt)+'</td></tr><tr><td>Items</td><td>'+m(itemsAmt)+'</td></tr>':"")+
           grand;
  }else{
    totals=groups.map(function(g){
      return '<tr><td>'+g.h.toFixed(2)+' h at '+(g.rate?m(g.rate):"no rate")+'</td><td>'+
        m(Math.round(g.a*100)/100)+'</td></tr>'}).join("")+
      (items.length?'<tr><td>Items</td><td>'+m(itemsAmt)+'</td></tr>':"")+
      grand;
  }
  var itemsHtml="";
  if(items.length){
    itemsHtml='<table class="qtab"><thead><tr><th>Description</th><th class="n">Qty</th>'+
      '<th class="n">Rate</th><th class="n">Amount</th></tr></thead><tbody>'+
      items.map(function(it){
        var q=parseFloat(it.qty);
        return '<tr><td>'+esc(it.desc||"")+(it.date?' <span class="u">'+esc(dateWords(it.date))+'</span>':"")+'</td>'+
          '<td class="n">'+(isFinite(q)?q:"")+(it.unit?' <span class="u">'+esc(it.unit)+'</span>':"")+'</td>'+
          '<td class="n">'+(parseFloat(it.rate)?m(parseFloat(it.rate)):"")+'</td>'+
          '<td class="n">'+m(itemAmount(it))+'</td></tr>';
      }).join("")+'</tbody></table>';
  }
  var period=sorted.length
    ? '<div class="period">'+esc(dlong(sorted[0].start))+' &ndash; '+esc(dlong(sorted[sorted.length-1].start))+
      '  ·  '+sorted.length+' blocks  ·  '+doc.hours.toFixed(2)+' h  ·  '+
      (onsite&&remote?onsite+' on-site, '+remote+' remote':(remote?'all remote':'all on-site'))+'</div>'+
      '<div class="ilog">'+logHtml+'</div>'
    : "";

  return (preview?'<div class="pv">Preview &mdash; nothing saved</div>':"")+
  '<header><div><p class="biz">'+esc(biz.name||"")+'</p><div class="small">'+
  esc(biz.address||"")+(biz.email?"\n"+esc(biz.email):"")+(biz.phone?"\n"+esc(biz.phone):"")+
  '</div></div><div class="tag"><h1>'+(rep?"Work report":"Invoice")+'</h1>'+
  (rep?"":'<div class="no">'+esc(doc.number||"")+'</div>')+
  '<div class="small">'+(rep?"As of ":"Issued ")+esc(dateWords(doc.issued))+
  (doc.due&&!rep?"\nDue "+esc(dateWords(doc.due)):"")+'</div></div></header>'+
  '<div class="parties"><h2>'+(rep?"Prepared for":"Bill to")+'</h2>'+
  '<div style="font-size:13px">'+esc(client.name||"")+'</div><div class="small">'+
  esc(client.address||"")+(client.email?"\n"+esc(client.email):"")+'</div></div>'+
  period+itemsHtml+
  '<div class="totals"><table>'+totals+'</table></div>'+
  ((doc.memo||(biz.terms&&!rep))?'<div class="memo">'+esc(doc.memo||"")+
    (doc.memo&&biz.terms&&!rep?"\n\n":"")+esc(rep?"":(biz.terms||""))+'</div>':"");
}

function bodyFor(doc,client,list,preview){
  if(doc.quote){ var qb=hook("quoteBody"); return qb?qb(doc,client,preview):"" }
  return docBody(doc,client,list,preview);
}
function titleFor(doc,client){
  if(doc.quote) return "Quote "+(doc.number||"");
  return doc.report?"Work report":("Invoice "+(doc.number||""));
}

function docFile(doc,client,list){
  return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">\n'+
  '<meta name="viewport" content="width=device-width,initial-scale=1">\n'+
  '<title>'+esc(titleFor(doc,client))+' — '+esc(client.name||"")+'</title>\n'+
  '<style>\n@page{margin:16mm 14mm}\nhtml{background:#eeedea}\nbody{margin:0;padding:24px 16px}\n'+
  docCss()+'\n@media print{html,body{background:#fff;padding:0}'+
  '.invsheet{border:0;padding:0;max-width:none;min-height:0;margin:0}}\n</style></head><body>'+
  '<div class="invsheet">'+bodyFor(doc,client,list,false)+'</div></body></html>';
}

/* ---------- the viewer: a light document inside the dark app ---------- */
var viewerState=null;
function showViewer(doc,client,list,preview){
  viewerState={doc:doc,client:client,list:list,preview:preview};
  var v=$("#viewer"); v.innerHTML="";
  var bar=el("div","vbar");
  var close=el("button","btn","close");close.type="button";
  close.onclick=hideViewer;
  bar.appendChild(close);
  var pr=el("button","btn solid","print / pdf");pr.type="button";
  pr.onclick=function(){ try{window.print()}catch(e){toast("printing isn't available here")} };
  bar.appendChild(pr);
  var lastBtn=null;
  if(!preview&&!doc.quote&&doc.id&&S.invoices[doc.id]){
    var vd=el("button","btn","void");vd.type="button";
    vd.onclick=function(){
      if(!vd.dataset.armed){vd.dataset.armed="1";vd.textContent="void — tap again";return}
      (doc.blockIds||[]).forEach(function(id){
        for(var k in S.months) if(S.months[k][id]){
          var b=S.months[k][id];
          if(b.invoiceId===doc.id){delete b.invoiceId;b.invoiced=false;b.updatedAt=now()}
        }});
      MODULES.forEach(function(m){ if(m.onVoid) m.onVoid(doc) });
      delete S.invoices[doc.id];
      save();hideViewer();renderAll();
      toast("voided — those blocks are un-invoiced again")};
    bar.appendChild(vd);
  }
  /* modules may add their own buttons here; one returned is placed last */
  var vb=hook("viewerButtons");
  if(vb) lastBtn=vb(doc,bar,preview)||null;
  if(!preview){
    var sv=el("button","btn","save file");sv.type="button";
    sv.onclick=function(){ saveDocFile(doc,client,list,false) };
    bar.appendChild(sv);
  }
  if(lastBtn) bar.appendChild(lastBtn);
  v.appendChild(bar);
  var sheet=el("div","invsheet");
  sheet.innerHTML=bodyFor(doc,client,list,preview);
  v.appendChild(sheet);
  v.classList.add("on");
  document.body.style.overflow="hidden";
  v.scrollTop=0;
}
function hideViewer(){
  $("#viewer").classList.remove("on");
  $("#viewer").innerHTML="";
  document.body.style.overflow="";
  viewerState=null;
}

/* ---------- things modules offer to bill ----------
   A module can register billables(clientId), returning what is waiting to be
   billed for that client:
     [{key:"prints:<id>", label, amount, item:{desc,qty,unit,rate,source,date},
       bill:function(invoiceId){ ...mark it billed... }}]
   and onVoid(invoice), to release them again when an invoice is voided.
   The invoice sheets list them with tick boxes; ticked ones become lines. */
function billablesFor(cid){
  var out=[];
  MODULES.forEach(function(m){ if(m.billables) out=out.concat(m.billables(cid)||[]) });
  return out;
}
function pickedBillables(cid,draft){
  var keys=draft.bill;
  return billablesFor(cid).filter(function(b){ return !keys||keys.indexOf(b.key)>=0 });
}
/* Everything waiting is ticked to start with; draft.bill holds the ticks. */
function billablePicker(sh,getCid,draft,onChange){
  var box=el("div"); sh.appendChild(box);
  function paint(){
    box.innerHTML="";
    var list=billablesFor(getCid());
    if(!list.length) return;
    if(!draft.bill) draft.bill=list.map(function(b){return b.key});
    box.appendChild(el("div","field")).appendChild(el("span",null,"waiting to be billed"));
    var log=el("div","log");
    list.forEach(function(b){
      var on=draft.bill.indexOf(b.key)>=0;
      var row=el("div","row"+(on?" on":"")), bx=el("span","box",on?"[x]":"[ ]"), body=el("div","body"), l1=el("div","l1");
      l1.appendChild(el("span",null,b.label)); l1.appendChild(el("span","hrs",money(b.amount)));
      body.appendChild(l1); row.appendChild(bx); row.appendChild(body);
      row.onclick=function(){
        var i=draft.bill.indexOf(b.key);
        if(i>=0) draft.bill.splice(i,1); else draft.bill.push(b.key);
        touch(); paint(); if(onChange) onChange();
      };
      log.appendChild(row);
    });
    box.appendChild(log);
  }
  paint();
  return {paint:paint, reset:function(){ draft.bill=null; paint() }};
}

/* ---------- + new invoice: line items, no hours needed ----------
   For flat fees, expenses and anything that isn't time. Invoices built from
   time blocks start on the blocks tab instead, and can carry items too. */
function sheetNewInvoice(sh,d){
  var cs=liveClients();
  if(!cs.length){ closeSheet(); toast("add a client in setup first"); return }
  var dr=d.draft;
  if(!dr.items) dr.items=[{desc:"",qty:"1",unit:"",rate:""}];
  if(!dr.cid||!S.clients[dr.cid]) dr.cid=cs[0].id;
  head(sh,"new invoice");
  var sc=el("select");
  cs.forEach(function(c){var o=el("option",null,c.name);o.value=c.id;sc.appendChild(o)});
  sc.value=dr.cid;
  if(cs.length>1) fieldOf(sh,"client",sc);
  var numIn=fieldOf(sh,"invoice number",inp("text",dr.num!=null?dr.num:nextNumber(S.clients[dr.cid]),""));
  numIn.addEventListener("input",function(){dr.num=numIn.value;dr.numTouched=true;touch()});
  sc.addEventListener("change",function(){
    dr.cid=sc.value;
    if(!dr.numTouched){ dr.num=nextNumber(S.clients[dr.cid]); numIn.value=dr.num }
    picker.reset(); paintTot();
    touch();
  });
  var two=el("div","two");
  var iss=inp("date",dr.issued||ymd(now())), due=inp("date",dr.due||ymd(addDays(now(),+S.settings.net||0)));
  var l1=el("label","field");l1.appendChild(el("span",null,"issued"));l1.appendChild(iss);
  var l2=el("label","field");l2.appendChild(el("span",null,"due"));l2.appendChild(due);
  two.appendChild(l1);two.appendChild(l2);sh.appendChild(two);
  iss.addEventListener("input",function(){dr.issued=iss.value;touch()});
  due.addEventListener("input",function(){dr.due=due.value;touch()});
  var tot=el("div","subtot");
  function pickedItems(){ return pickedBillables(dr.cid,dr).map(function(b){return b.item}) }
  function paintTot(){ tot.innerHTML=""; tot.appendChild(el("span","sc","total")); tot.appendChild(el("b",null,money(itemsTotal(pickedItems().concat(dr.items))))) }
  var picker=billablePicker(sh,function(){return dr.cid},dr,paintTot);
  sh.appendChild(el("div","field")).appendChild(el("span",null,"line items"));
  itemEditor(sh,function(){return dr.items},function(l){dr.items=l},paintTot);
  sh.appendChild(tot); paintTot();
  var memo=el("textarea");memo.rows=2;memo.placeholder="optional note to the client";memo.value=dr.memo||"";
  fieldOf(sh,"memo",memo);
  memo.addEventListener("input",function(){dr.memo=memo.value;touch()});
  function compose(){
    var c=S.clients[dr.cid]||{};
    var items=cleanItems(pickedItems().concat(dr.items));
    return {number:(numIn.value||"").trim(),clientId:c.id,issued:iss.value,due:due.value,
      memo:(memo.value||"").trim(),mode:"block",desc:"",blockIds:[],items:items,
      total:itemsTotal(items),hours:0,snap:snapFor(c)};
  }
  var btns=el("div","btns");
  var pv=el("button","btn grow","preview");pv.type="button";
  pv.onclick=function(){ var doc=compose(); showViewer(doc,invoiceClient(doc),[],true) };
  var sv=el("button","btn solid grow","save invoice");sv.type="button";
  sv.onclick=function(){
    var doc=compose(), c=S.clients[dr.cid];
    if(!doc.items.length){ toast("add at least one line item"); return }
    if(!doc.number){ toast("give it an invoice number"); return }
    var picked=pickedBillables(dr.cid,dr);
    recordInvoice(doc,c,[]);
    picked.forEach(function(b){ b.bill(doc.id) }); save();
    saveDocFile(doc,invoiceClient(doc),[],false);
    UI.sheet=null;saveUI();closeSheet();renderAll();
    showViewer(doc,invoiceClient(doc),[],false);
  };
  btns.appendChild(pv);btns.appendChild(sv);sh.appendChild(btns);
  sh.appendChild(el("div","note","Saving records the invoice, advances the client's number and files it. It can be voided from the invoices tab."));
}
CORE_SHEETS.newinvoice=sheetNewInvoice;
$("#addInvoice").addEventListener("click",function(){openSheet({kind:"newinvoice"})});
