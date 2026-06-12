// VB6 form renderer — turns layout.json controls into absolutely-positioned DOM.
(function () {
  "use strict";
  const ASSET = "assets/";

  function fontCss(f) {
    if (!f) return {};
    const s = {};
    if (f.family) s.fontFamily = `"${f.family}",sans-serif`;
    if (f.size) s.fontSize = (f.size * 96 / 72).toFixed(1) + "px"; // pt -> px
    if (f.bold) s.fontWeight = "bold";
    if (f.italic) s.fontStyle = "italic";
    if (f.underline) s.textDecoration = "underline";
    return s;
  }
  function px(n) { return (n || 0) + "px"; }
  function assign(el, st) { for (const k in st) el.style[k] = st[k]; }

  // Render a control node into a parent element; returns the DOM element.
  function renderControl(node, formApi) {
    const t = node.type;
    let el;
    const base = () => {
      const d = document.createElement("div");
      d.className = "ctl";
      assign(d, { left: px(node.Left), top: px(node.Top), width: px(node.Width), height: px(node.Height) });
      return d;
    };

    switch (t) {
      case "VB.Label": {
        el = base();
        el.classList.add("ctl-label");
        assign(el, fontCss(node.Font));
        if (node.ForeColor) el.style.color = node.ForeColor;
        if (node.BackColor && !node.Transparent) el.style.background = node.BackColor;
        if (node.Alignment === 2) el.style.justifyContent = "center";
        else if (node.Alignment === 1) el.style.justifyContent = "flex-end";
        el.textContent = node.Caption || "";
        break;
      }
      case "VB.CommandButton": {
        el = document.createElement("button");
        el.className = "ctl ctl-button";
        assign(el, { left: px(node.Left), top: px(node.Top), width: px(node.Width), height: px(node.Height) });
        assign(el, fontCss(node.Font));
        if (node.BackColor) el.style.background = node.BackColor;
        if (node.ForeColor) el.style.color = node.ForeColor;
        el.textContent = node.Caption || "";
        if (node.Enabled === false) el.disabled = true;
        break;
      }
      case "VB.TextBox": {
        if (node.MultiLine) {
          el = document.createElement("textarea");
        } else {
          el = document.createElement("input");
          el.type = "text";
        }
        el.className = "ctl ctl-text";
        assign(el, { left: px(node.Left), top: px(node.Top), width: px(node.Width), height: px(node.Height) });
        assign(el, fontCss(node.Font));
        if (node.ForeColor) el.style.color = node.ForeColor;
        if (node.BackColor) el.style.background = node.BackColor;
        if (node.Text != null) el.value = node.Text;
        if (node.Enabled === false) el.disabled = true;
        break;
      }
      case "VB.Image":
      case "VB.PictureBox": {
        el = document.createElement("img");
        el.className = "ctl ctl-image";
        assign(el, { left: px(node.Left), top: px(node.Top), width: px(node.Width), height: px(node.Height) });
        if (node.Picture) { el.src = node.Picture; }
        else { el.classList.add("noimg"); el.removeAttribute("src"); }
        el.onerror = () => { el.classList.add("noimg"); el.removeAttribute("src"); };
        break;
      }
      case "VB.Frame": {
        el = base();
        el.classList.add("ctl-frame");
        assign(el, fontCss(node.Font));
        if (node.Caption) {
          const c = document.createElement("div");
          c.className = "frame-cap";
          c.textContent = node.Caption;
          el.appendChild(c);
        }
        break;
      }
      case "VB.ComboBox": {
        el = document.createElement("select");
        el.className = "ctl ctl-combo";
        assign(el, { left: px(node.Left), top: px(node.Top), width: px(node.Width), height: px(node.Height || 24) });
        assign(el, fontCss(node.Font));
        break;
      }
      case "VB.ListBox": {
        el = base();
        el.classList.add("ctl-list");
        assign(el, fontCss(node.Font));
        if (node.ForeColor) el.style.color = node.ForeColor;
        el._items = [];
        break;
      }
      case "VB.CheckBox": {
        el = base();
        el.classList.add("ctl-check");
        assign(el, fontCss(node.Font));
        const box = document.createElement("input"); box.type = "checkbox";
        const lab = document.createElement("span"); lab.textContent = node.Caption || "";
        el.appendChild(box); el.appendChild(lab);
        el._box = box;
        break;
      }
      case "VB.OptionButton": {
        el = base();
        el.classList.add("ctl-option");
        assign(el, fontCss(node.Font));
        const box = document.createElement("input"); box.type = "radio"; box.name = "opt_" + (node._group || "g");
        const lab = document.createElement("span"); lab.textContent = node.Caption || "";
        el.appendChild(box); el.appendChild(lab);
        el._box = box;
        break;
      }
      case "VB.Line": {
        // VB.Line: draw from (X1,Y1) to (X2,Y2) as a rotated bar.
        el = document.createElement("div");
        el.className = "ctl ctl-line";
        const x1 = node.X1 || 0, y1 = node.Y1 || 0, x2 = node.X2 || 0, y2 = node.Y2 || 0;
        const dx = x2 - x1, dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        const ang = Math.atan2(dy, dx) * 180 / Math.PI;
        const w = Math.max(1, node.BorderWidth || 1);
        el.style.left = px(x1);
        el.style.top = px(y1 - w / 2);
        el.style.width = px(len);
        el.style.height = px(w);
        el.style.background = node.BorderColor || "#000";
        el.style.transformOrigin = "0 50%";
        el.style.transform = `rotate(${ang}deg)`;
        break;
      }
      case "ShockwaveFlashObjectsCtl.ShockwaveFlash": {
        el = base();
        el.classList.add("ctl-flash");
        el.dataset.flash = "1";
        break;
      }
      case "VB.Timer":
      case "MSWinsockLib.Winsock":
        return null; // non-visual
      case "VB.Data":
      case "MSAdodcLib.Adodc":
      case "MSDataGridLib.DataGrid":
      case "VB.FileListBox":
      case "VB.DirListBox":
      case "VB.DriveListBox":
        // non-essential data plumbing — render nothing visible
        return null;
      default:
        el = base();
        break;
    }

    el.dataset.name = node.name;
    if (node.Index != null) el.dataset.index = node.Index;
    if (node.Visible === false) el.style.display = "none";
    return el;
  }

  // Render a whole form. Returns {win, canvas, controls:{name:[el,...]}}
  function renderForm(form) {
    const win = document.createElement("div");
    win.className = "vbform";
    win.dataset.slug = form.slug;
    const cw = form.ClientWidth || 600, ch = form.ClientHeight || 400;

    const tb = document.createElement("div");
    tb.className = "titlebar";
    const ttl = document.createElement("div"); ttl.className = "ttl"; ttl.textContent = form.Caption || form.vb_name;
    const btns = document.createElement("div"); btns.className = "btns";
    btns.innerHTML = '<div class="winbtn">_</div><div class="winbtn">□</div><div class="winbtn">×</div>';
    tb.appendChild(ttl); tb.appendChild(btns);
    win.appendChild(tb);

    // menus
    if (form.menus && form.menus.length) {
      const mb = document.createElement("div"); mb.className = "menubar";
      form.menus.forEach(m => {
        const top = document.createElement("div"); top.className = "mtop"; top.textContent = m.caption;
        top.dataset.name = m.name;
        if (m.children && m.children.length) {
          const sub = document.createElement("div"); sub.className = "msub";
          m.children.forEach(c => {
            const it = document.createElement("div"); it.className = "mitem"; it.textContent = c.caption; it.dataset.name = c.name;
            sub.appendChild(it);
          });
          top.appendChild(sub);
        }
        mb.appendChild(top);
      });
      win.appendChild(mb);
    }

    const canvas = document.createElement("div");
    canvas.className = "canvas";
    assign(canvas, { width: px(cw), height: px(ch) });
    if (form.BackColor) canvas.style.background = form.BackColor;
    win.appendChild(canvas);

    const controls = {};
    // VB6 .frm lists controls front-to-back: the FIRST control is topmost in
    // z-order. The DOM paints later siblings on top, so we assign an explicit
    // decreasing z-index in file order (first listed = highest).
    let zCounter = 100000;
    function place(node, parentEl) {
      const el = renderControl(node, null);
      if (el) {
        el.style.zIndex = zCounter--;
        parentEl.appendChild(el);
        (controls[node.name] = controls[node.name] || []).push(el);
        el._node = node;
      }
      // children of frames go inside; everything else flat (VB containers
      // are absolute, but for fidelity we place children relative to frame)
      const host = (el && node.type === "VB.Frame") ? el : parentEl;
      (node.children || []).forEach(ch => {
        if (host === el) {
          // VB6 nests Frame children with coordinates ALREADY relative to the
          // frame's interior, so render them as-is (no offset subtraction).
          const ce = renderControl(ch, null);
          if (ce) { ce.style.zIndex = zCounter--; el.appendChild(ce); (controls[ch.name] = controls[ch.name] || []).push(ce); ce._node = ch; }
          (ch.children || []).forEach(g => place(g, el));
        } else {
          place(ch, parentEl);
        }
      });
    }
    (form.children || []).forEach(n => place(n, canvas));

    win.style.width = (cw + 4) + "px";
    return { win, canvas, controls, form };
  }

  window.VBRenderer = { renderForm, renderControl, fontCss };
})();
