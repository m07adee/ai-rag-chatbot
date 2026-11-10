/*! Lumina AI chat widget — embed on any website:
 *  <script src="https://YOUR-DOMAIN/widget.js" data-lang="en" async></script>
 */
(function () {
  if (window.__luminaChat) return;
  window.__luminaChat = true;
  var script = document.currentScript;
  var origin = new URL(script.src).origin;
  var lang = (script.getAttribute("data-lang") || navigator.language || "en").slice(0, 2);
  var rtl = lang === "ar";

  var css = document.createElement("style");
  css.textContent =
    "#lumina-btn{position:fixed;bottom:20px;" + (rtl ? "left" : "right") + ":20px;width:58px;height:58px;border-radius:50%;border:0;cursor:pointer;z-index:2147483646;" +
    "background:linear-gradient(135deg,#14b8a6,#0891b2);color:#fff;font-size:26px;box-shadow:0 10px 30px -6px rgba(13,148,136,.7);transition:transform .2s}" +
    "#lumina-btn:hover{transform:scale(1.07)}" +
    "#lumina-frame{position:fixed;bottom:90px;" + (rtl ? "left" : "right") + ":20px;width:min(400px,calc(100vw - 32px));height:min(640px,calc(100vh - 120px));border:0;border-radius:24px;" +
    "box-shadow:0 24px 70px -12px rgba(15,23,42,.35);z-index:2147483647;opacity:0;transform:translateY(16px) scale(.97);pointer-events:none;transition:opacity .25s,transform .25s;background:#fff}" +
    "#lumina-frame.open{opacity:1;transform:none;pointer-events:auto}";
  document.head.appendChild(css);

  var frame = document.createElement("iframe");
  frame.id = "lumina-frame";
  frame.title = "Chat";
  frame.src = origin + "/embed?lang=" + encodeURIComponent(lang);
  var btn = document.createElement("button");
  btn.id = "lumina-btn";
  btn.setAttribute("aria-label", "Open chat");
  btn.textContent = "💬";

  function toggle(open) {
    var isOpen = typeof open === "boolean" ? open : !frame.classList.contains("open");
    frame.classList.toggle("open", isOpen);
    btn.textContent = isOpen ? "✕" : "💬";
  }
  btn.onclick = function () { toggle(); };
  window.addEventListener("message", function (e) {
    if (e.origin === origin && e.data && e.data.type === "lumina-chat:close") toggle(false);
  });
  document.body.appendChild(frame);
  document.body.appendChild(btn);
})();
