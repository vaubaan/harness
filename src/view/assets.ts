/** Inline style and script of the view: no network, no build step. */

export const VIEW_STYLE = `
:root{--bg:#f4f6f5;--surface:#fff;--sunk:#e9edeb;--fg:#17211d;--muted:#5b6862;--line:#d3d9d5;--accent:#0f6e62;--accent-soft:#d6ebe6;
--ok:#2f7d3c;--ok-soft:#e0f0e2;--warn:#9a6200;--warn-soft:#f8ecd2;--err:#b3361f;--err-soft:#f7dfd9;--dot:#c8cfca;
--f:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#111614;--surface:#1a201d;--sunk:#0d1110;--fg:#e3eae5;--muted:#95a39b;--line:#2c3530;--accent:#4fc2b0;--accent-soft:#163430;
--ok:#6cc47a;--ok-soft:#183019;--warn:#e7ad45;--warn-soft:#352a12;--err:#f0806a;--err-soft:#3b1d17;--dot:#29312d;color-scheme:dark}}
*{box-sizing:border-box}html,body{height:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 var(--f);display:flex;flex-direction:column}
a{color:var(--accent)}code,.mono{font-family:var(--mono);font-size:.86em}code{background:var(--sunk);padding:0 .3em;border-radius:3px}
h2{font-size:1.3rem;margin:0 0 .3rem}h3{font-size:1rem;margin:0 0 .4rem}h4{margin:.8rem 0 .3rem;font-size:.8rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.k{color:var(--muted);font-size:.85em}.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
button{font:inherit;cursor:pointer;border:1px solid var(--line);background:var(--surface);color:var(--fg);border-radius:6px;padding:4px 10px}
button:hover{border-color:var(--accent)}button:focus-visible,a:focus-visible,input:focus-visible,textarea:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
button[disabled]{opacity:.5;cursor:default}
header.top{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;padding:8px 16px;border-bottom:1px solid var(--line);background:var(--surface);position:relative;z-index:5}
.brand{display:flex;flex-direction:column;line-height:1.2;min-width:0}
.tabs{display:flex;flex-wrap:wrap;gap:2px}
.tabs a{padding:4px 10px;border-radius:6px;text-decoration:none;color:var(--muted)}
.tabs a.on{background:var(--accent-soft);color:var(--accent);font-weight:600}
.status{margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
#q{border:1px solid var(--line);background:var(--bg);color:var(--fg);border-radius:6px;padding:4px 8px;width:180px}
.live{display:inline-flex;gap:5px;align-items:center;font-size:.8rem;color:var(--muted)}.live i{width:7px;height:7px;border-radius:50%;background:var(--ok)}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:7px;padding:1px}.seg button{border:0;padding:3px 8px;font-size:.8rem}
.seg button[aria-pressed=true]{background:var(--accent-soft);color:var(--accent);font-weight:600}
main{flex:1;min-height:0;position:relative;overflow:auto}
.view{padding:16px 20px}.js .view:not(.active){display:none}
#view-canvas{padding:0;height:100%}
.pill{display:inline-block;font-size:.72rem;font-weight:600;padding:0 .5em;border-radius:99px;white-space:nowrap;margin-right:3px}
.p-ok{background:var(--ok-soft);color:var(--ok)}.p-warn{background:var(--warn-soft);color:var(--warn)}.p-err{background:var(--err-soft);color:var(--err)}
.p-acc{background:var(--accent-soft);color:var(--accent)}.p-mut{background:var(--sunk);color:var(--muted)}
.cv{position:relative;height:100%;min-height:420px;overflow:hidden;background-image:radial-gradient(var(--dot) 1.1px,transparent 1.2px);background-size:22px 22px;touch-action:none;cursor:grab;outline:none}
.cv.drag{cursor:grabbing}.cv-world{position:absolute;left:0;top:0;transform-origin:0 0}
.frame{position:absolute;border:1.5px solid var(--line);border-radius:14px;background:color-mix(in srgb,var(--surface) 50%,transparent)}
.frame.f-harness{border-style:dashed;border-color:var(--accent)}
.ft{position:absolute;top:-11px;left:14px;background:var(--bg);padding:0 8px;font-size:.72rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.n{position:absolute;height:78px;overflow:hidden;display:flex;flex-direction:column;gap:2px;background:var(--surface);border:1px solid var(--line);border-radius:9px;padding:7px 10px;color:var(--fg);text-decoration:none;box-shadow:0 1px 2px rgb(0 0 0/.05)}
.n:hover{border-color:var(--accent)}.n .t{font-weight:600;font-size:.82rem;line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.n .s{font-size:.7rem;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.n .row{margin-top:auto;white-space:nowrap;overflow:hidden}
.n.d-harness{border-style:dashed}.n.has-err{border-color:var(--err)}
.n.t-intent-file,.n.t-readme,.n.t-spec{background:var(--sunk)}
.n.sel{outline:2px solid var(--accent);outline-offset:2px;z-index:2}.n.dim{opacity:.25}
.edges{position:absolute;left:0;top:0;pointer-events:none;overflow:visible}
.edges path{fill:none;stroke:var(--muted);stroke-width:1.4;display:none}
.cv.all-edges .edges path{display:block;opacity:.35}.edges path.on{display:block;stroke:var(--accent);stroke-width:2;opacity:1}
.edges path.e-requires.on,.edges path.e-creates.on{stroke-dasharray:5 3}
.cv-tools{position:absolute;right:12px;bottom:12px;display:flex;gap:4px;z-index:3}.cv-tools button{box-shadow:0 1px 3px rgb(0 0 0/.1)}
.cv-tools button[aria-pressed=true]{background:var(--accent-soft);color:var(--accent)}
.cv[data-view=before] .is-add{display:none}.cv[data-view=now] .is-del{display:none}
.cv[data-view=diff] .n.is-add{border:2px solid var(--ok);box-shadow:0 0 0 4px var(--ok-soft)}
.cv[data-view=diff] .n.is-chg{border:2px solid var(--warn);box-shadow:0 0 0 4px var(--warn-soft)}
.cv[data-view=diff] .n.is-del{border:2px dashed var(--err);opacity:.75}.cv[data-view=diff] .n.is-del .t{text-decoration:line-through}
.diff-tag{display:none;position:absolute;top:2px;right:6px;font-size:.6rem;font-weight:700;padding:0 5px;border-radius:99px;color:var(--surface)}
.cv[data-view=diff] .diff-tag{display:block}.is-add .diff-tag{background:var(--ok)}.is-chg .diff-tag{background:var(--warn)}.is-del .diff-tag{background:var(--err)}
.side{position:fixed;right:0;top:0;bottom:0;width:min(420px,100%);background:var(--surface);border-left:1px solid var(--line);z-index:10;overflow:auto;padding:16px 18px;box-shadow:-6px 0 20px rgb(0 0 0/.08)}
.js .side{transform:translateX(105%);transition:transform .15s}.js .side.open{transform:none}
@media (prefers-reduced-motion:reduce){.js .side{transition:none}}
.side .close{position:absolute;right:10px;top:8px;border:0;font-size:1.3rem;padding:0 6px}
.js .detail{display:none}.js .detail.on{display:block}.js .side.open .empty{display:none}
.detail{border-bottom:1px solid var(--line);padding-bottom:12px;margin-bottom:12px}.detail header{margin-bottom:8px}.detail h3{font-size:1.05rem;margin:2px 0}
dl{display:grid;grid-template-columns:96px 1fr;gap:4px 10px;margin:8px 0}dt{color:var(--muted);font-size:.8rem}dd{margin:0;min-width:0;overflow-wrap:anywhere}
dd ul{margin:0;padding-left:1.1em}dl.rel dt{grid-column:1/-1;margin-top:6px;font-weight:600}dl.rel dd{grid-column:1/-1}
.issues{list-style:none;padding:0;margin:8px 0}.issues li{border-left:3px solid var(--err);background:var(--err-soft);padding:6px 8px;border-radius:0 6px 6px 0;margin-bottom:4px}
.issues li.sev-warning{border-color:var(--warn);background:var(--warn-soft)}
.comments textarea,.reply textarea{width:100%;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg);font:inherit;padding:6px}
.comments form,.reply{display:grid;gap:6px;margin-top:6px}.btns{display:flex;gap:6px}
.thread{border:1px solid var(--line);border-radius:8px;padding:8px;margin:6px 0;background:var(--bg)}
.thread header{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.msg{margin-top:6px}.msg p{margin:2px 0;white-space:pre-wrap}
.who{font-size:.72rem;font-weight:700;color:var(--muted)}.m-agent .who{color:var(--accent)}.chg{background:var(--accent-soft);padding:0 4px;border-radius:3px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:12px 0}
.tile{background:var(--surface);border:1px solid var(--line);border-radius:9px;padding:10px 12px;display:grid}
.tile.bad{border-color:var(--err)}.tile.warn{border-color:var(--warn)}
.tl{font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:700}.tv{font-size:1.4rem;font-weight:700;font-variant-numeric:tabular-nums}.ts{font-size:.75rem;color:var(--muted)}
.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:12px}
.panel{background:var(--surface);border:1px solid var(--line);border-radius:9px;padding:12px}
.list{list-style:none;padding:0;margin:0;display:grid;gap:5px}
.tree{list-style:none;padding:0;margin:0;display:grid;gap:4px;max-width:980px}
.tr{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-left:calc(var(--d)*20px);background:var(--surface);border:1px solid var(--line);border-radius:7px;padding:6px 10px}
.tr .ttl{flex:1;min-width:200px}.tr.pr{border-color:var(--warn)}.tr .acc{flex-basis:100%;margin:2px 0 0;padding-left:1.2em;color:var(--muted);font-size:.85rem}
.bar{display:inline-block;width:90px;height:6px;background:var(--sunk);border-radius:99px;overflow:hidden}.bar i{display:block;height:100%;background:var(--ok)}
.terms{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px}
.term{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:8px 10px;display:grid;gap:2px}
.term.warn{border-color:var(--warn)}.term.bad{border-color:var(--err)}.term.dim{border-style:dashed;opacity:.7}.term .note{font-size:.78rem;color:var(--warn)}
.adrs{display:grid;gap:6px;max-width:980px}.adr{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:8px 12px}
.adr summary{cursor:pointer}.adr p{margin:6px 0}.alt{font-size:.85rem;color:var(--muted);border-left:2px solid var(--line);padding-left:8px;margin:4px 0}
.lint-map{display:grid;gap:6px;max-width:1100px}
.lr{display:grid;grid-template-columns:200px 1fr 220px;gap:10px;align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:7px 10px}
.lp{font-weight:600}.lc{display:flex;flex-wrap:wrap;gap:5px}
.lk{font-family:var(--mono);font-size:.76rem;border:1px solid var(--err);border-radius:5px;padding:1px 7px;text-decoration:none;color:var(--fg)}
.lk.w{border-color:var(--warn);border-style:dashed}.lk i{font-style:normal;font-weight:700;color:var(--ok)}.lk i.bad{color:var(--err)}
.ls{font-family:var(--mono);font-size:.76rem;color:var(--accent)}.ls.none{color:var(--warn)}
@media (max-width:760px){.lr{grid-template-columns:1fr}}
.layers{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}.ly{border:1px solid var(--line);border-radius:99px;padding:1px 10px;font-size:.8rem;color:var(--muted)}
.ly.on{border-color:var(--accent);color:var(--accent);font-weight:600}
.tbl{overflow-x:auto;border:1px solid var(--line);border-radius:8px;background:var(--surface);max-width:1100px}
table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:6px 10px;border-bottom:1px solid var(--line);white-space:nowrap}
th{font-size:.7rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);background:var(--sunk)}
td.ok{color:var(--ok)}td.no{color:var(--muted)}td.warn{color:var(--warn)}td.num{text-align:right;font-variant-numeric:tabular-nums}
.lessons{display:grid;gap:8px;max-width:980px}.lesson{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:8px 12px;display:grid;gap:4px}
.session-actions{display:flex;gap:8px;margin:8px 0}.session-actions [data-submit]{background:var(--accent);color:var(--surface);border-color:var(--accent)}
.journal{margin:0;padding-left:1.2em;display:grid;gap:4px}.threads{display:grid;gap:6px;max-width:900px}
`;

export const VIEW_SCRIPT = `
(function(){
"use strict";
var d=document,B=d.body;B.classList.add("js");
var st={tab:"canvas",sel:null,s:1,x:0,y:0,fitted:false,diff:"now",edges:false,q:""};
function $(s,r){return (r||d).querySelector(s)}function $$(s,r){return Array.prototype.slice.call((r||d).querySelectorAll(s))}
function cv(){return $("#cv")}function world(){return $("#world")}
function apply(){var w=world();if(w)w.style.transform="translate("+st.x+"px,"+st.y+"px) scale("+st.s+")"}
function fit(){var c=cv(),w=world();if(!c||!w||!c.clientWidth)return;var W=w.offsetWidth,H=w.offsetHeight;
st.s=Math.min(1,Math.max(.12,Math.min(c.clientWidth/W,c.clientHeight/Math.min(H,2400))));st.x=Math.max(8,(c.clientWidth-W*st.s)/2);st.y=10;st.fitted=true;apply()}
function zoomAt(f,cx,cy){var ns=Math.min(2.5,Math.max(.08,st.s*f));st.x=cx-(cx-st.x)*ns/st.s;st.y=cy-(cy-st.y)*ns/st.s;st.s=ns;apply()}
function center(nid){var c=cv(),card=d.getElementById("c-"+nid.slice(2));if(!c||!card)return;
var cx=card.offsetLeft+card.offsetWidth/2,cy=card.offsetTop+card.offsetHeight/2;if(st.s<.6)st.s=.8;st.x=c.clientWidth/2-cx*st.s;st.y=c.clientHeight/2-cy*st.s;apply()}
function showTab(t){if(!d.getElementById("view-"+t))t="canvas";st.tab=t;$$(".view").forEach(function(v){v.classList.toggle("active",v.id==="view-"+t)});
$$("[data-tab]").forEach(function(a){a.classList.toggle("on",a.getAttribute("data-tab")===t)});if(t==="canvas"&&!st.fitted)setTimeout(fit,0)}
function select(nid,move){st.sel=nid;$$(".n.sel").forEach(function(n){n.classList.remove("sel")});$$(".edges path.on").forEach(function(p){p.classList.remove("on")});
$$(".detail.on").forEach(function(x){x.classList.remove("on")});var side=$("#side");
if(!nid){side.classList.remove("open");return}var det=d.getElementById(nid);if(det){det.classList.add("on");side.classList.add("open");side.scrollTop=0}
var card=d.getElementById("c-"+nid.slice(2));if(card)card.classList.add("sel");
$$('.edges path[data-a="'+nid+'"],.edges path[data-b="'+nid+'"]').forEach(function(p){p.classList.add("on")});if(move&&st.tab==="canvas")center(nid)}
function filter(){var q=st.q.toLowerCase();$$(".n").forEach(function(n){n.classList.toggle("dim",!!q&&(n.getAttribute("data-q")||"").indexOf(q)<0)})}
function restore(){showTab(st.tab);var c=cv();if(c){c.setAttribute("data-view",st.diff);c.classList.toggle("all-edges",st.edges)}apply();if(st.sel)select(st.sel,false);filter();
$$("[data-diff]").forEach(function(b){b.setAttribute("aria-pressed",String(b.getAttribute("data-diff")===st.diff))});var eb=$("[data-edges]");if(eb)eb.setAttribute("aria-pressed",String(st.edges))}
d.addEventListener("click",function(e){var t=e.target.closest("a,button");if(!t)return;
var n=t.getAttribute("data-n");if(n){e.preventDefault();var fromCard=t.classList.contains("n");if(fromCard&&moved)return;select(n,!fromCard);return}
var tab=t.getAttribute("data-tab");if(tab){e.preventDefault();showTab(tab);try{history.replaceState(null,"","#view-"+tab)}catch(_){}return}
var z=t.getAttribute("data-zoom");if(z){var c=cv();if(z==="fit")fit();else zoomAt(z==="in"?1.25:.8,c.clientWidth/2,c.clientHeight/2);return}
if(t.hasAttribute("data-edges")){st.edges=!st.edges;restore();return}
var df=t.getAttribute("data-diff");if(df){st.diff=df;restore();return}
if(t.hasAttribute("data-close")){select(null);return}
if(t.hasAttribute("data-submit")){post("/api/submit",{});return}
if(t.hasAttribute("data-end")){if(confirm("End the review? The agent then keeps or discards the changes."))post("/api/end",{});return}
var rs=t.getAttribute("data-resolve");if(rs){post("/api/threads/"+encodeURIComponent(rs)+"/resolve",{});return}});
d.addEventListener("submit",function(e){var f=e.target;var ta=$("textarea",f);var body=ta&&ta.value.trim();e.preventDefault();if(!body)return;
if(f.classList.contains("comment"))post("/api/threads",{nodeId:f.getAttribute("data-node"),body:body}).then(function(ok){if(ok)ta.value=""});
else if(f.classList.contains("reply"))post("/api/threads/"+encodeURIComponent(f.getAttribute("data-thread"))+"/messages",{body:body}).then(function(ok){if(ok)ta.value=""})});
var q=$("#q");if(q)q.addEventListener("input",function(){st.q=q.value;filter()});
if(q)q.addEventListener("keydown",function(e){if(e.key==="Enter"){var m=$(".n:not(.dim)");if(m&&st.q){showTab("canvas");select(m.getAttribute("data-n"),true)}}});
d.addEventListener("keydown",function(e){if(/INPUT|TEXTAREA/.test((e.target.tagName||"")))return;
if(e.key==="/"){e.preventDefault();if(q)q.focus()}else if(e.key==="f")fit();else if(e.key==="l"){st.edges=!st.edges;restore()}
else if(e.key==="d"&&B.hasAttribute("data-session")){st.diff=st.diff==="diff"?"now":"diff";restore()}else if(e.key==="Escape")select(null)});
var drag=null,moved=false,pts={},pinch=null;
d.addEventListener("pointerdown",function(e){var c=cv();if(!c||!c.contains(e.target)||e.target.closest(".cv-tools"))return;
pts[e.pointerId]={x:e.clientX,y:e.clientY};var k=Object.keys(pts);moved=false;
if(k.length===1){drag={x:e.clientX-st.x,y:e.clientY-st.y,sx:e.clientX,sy:e.clientY};c.classList.add("drag")}
else if(k.length===2){var a=pts[k[0]],b=pts[k[1]];pinch={d:Math.hypot(a.x-b.x,a.y-b.y),s:st.s};drag=null}});
d.addEventListener("pointermove",function(e){if(!pts[e.pointerId])return;pts[e.pointerId]={x:e.clientX,y:e.clientY};var k=Object.keys(pts),c=cv();
if(pinch&&k.length===2){var a=pts[k[0]],b=pts[k[1]],r=c.getBoundingClientRect();zoomAt(pinch.s*Math.hypot(a.x-b.x,a.y-b.y)/pinch.d/st.s,(a.x+b.x)/2-r.left,(a.y+b.y)/2-r.top);moved=true}
else if(drag){if(Math.abs(e.clientX-drag.sx)+Math.abs(e.clientY-drag.sy)>4)moved=true;st.x=e.clientX-drag.x;st.y=e.clientY-drag.y;apply()}});
function up(e){delete pts[e.pointerId];if(Object.keys(pts).length<2)pinch=null;if(!Object.keys(pts).length){drag=null;var c=cv();if(c)c.classList.remove("drag");setTimeout(function(){moved=false},0)}}
d.addEventListener("pointerup",up);d.addEventListener("pointercancel",up);
d.addEventListener("wheel",function(e){var c=cv();if(!c||!c.contains(e.target))return;e.preventDefault();var r=c.getBoundingClientRect();
if(e.ctrlKey||e.metaKey||Math.abs(e.deltaY)>=Math.abs(e.deltaX)&&!e.shiftKey)zoomAt(Math.exp(-e.deltaY*.0015),e.clientX-r.left,e.clientY-r.top);else{st.x-=e.deltaX;st.y-=e.deltaY;apply()}},{passive:false});
window.addEventListener("resize",function(){if(st.tab==="canvas"&&!st.sel)fit()});
var h=location.hash.replace(/^#/,"");if(/^view-/.test(h))showTab(h.slice(5));else{showTab("canvas");if(/^n-/.test(h))setTimeout(function(){select(h,true)},0)}
setTimeout(fit,0);
// ---------------------------------------------------------------- session
var live=B.hasAttribute("data-session");
function post(url,body){return fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body),credentials:"same-origin"})
.then(function(r){if(!r.ok)return r.text().then(function(t){alert(t||("error "+r.status));return false});return refresh().then(function(){return true})})
.catch(function(){return false})}
function refresh(){if(!live)return Promise.resolve();return fetch(location.pathname,{cache:"no-store",credentials:"same-origin"}).then(function(r){return r.text()}).then(function(html){
var doc=new DOMParser().parseFromString(html,"text/html");var drafts={};$$("textarea").forEach(function(t){if(t.id&&t.value)drafts[t.id]=t.value});
["main","#side","#hs"].forEach(function(sel){var a=$(sel),b=$(sel,doc);if(a&&b)a.replaceChildren.apply(a,Array.prototype.slice.call(b.childNodes).map(function(n){return d.importNode(n,true)}))});
B.setAttribute("data-revision",doc.body.getAttribute("data-revision")||"");Object.keys(drafts).forEach(function(id){var t=d.getElementById(id);if(t)t.value=drafts[id]});restore()})}
if(live&&window.EventSource){var es=new EventSource("/api/events");es.addEventListener("update",function(ev){if(ev.data!==B.getAttribute("data-revision"))refresh()});
es.addEventListener("end",function(){var l=$(".live");if(l)l.textContent="review ended";es.close()})}
})();
`;
