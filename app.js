// Restaurant System — web recreation engine + ported VB6 form logic.
(function () {
  "use strict";
  let LAYOUT = null;
  const desktop = () => document.getElementById("desktop");

  // ---- live data (clone so edits during a session behave like the .mdb) ----
  const DB = window.DB;
  const menu = DB.menu;        // 菜單
  const combo = DB.combo;      // 套餐
  let inventory = DB.inventory.map(r => Object.assign({}, r)); // 存貨管理 (mutable)

  // ===== VB runtime helpers =====
  const vbCrLf = "\n", vbTab = "\t";
  function Space(n) { return " ".repeat(Math.max(0, n | 0)); }

  // MsgBox: returns a promise resolving to "yes"/"no"/"ok"
  const VB_YESNO = 4, VB_OK = 0;
  function MsgBox(text, flags, title) {
    flags = flags || 0;
    const yesno = (flags & 7) === VB_YESNO;
    let icon = "";
    if (flags & 16) icon = "⛔"; else if (flags & 32) icon = "❓"; else if (flags & 48) icon = "⚠️"; else if (flags & 64) icon = "ℹ️";
    return new Promise(resolve => {
      buildModal({
        title: title || "餐廳系統", icon, body: String(text),
        buttons: yesno ? [["是(Y)", "yes"], ["否(N)", "no"]] : [["確定", "ok"]],
        onClose: resolve
      });
    });
  }
  function InputBox(prompt, title, dflt) {
    return new Promise(resolve => {
      buildModal({
        title: title || "餐廳系統", body: String(prompt), input: dflt != null ? String(dflt) : "",
        buttons: [["確定", "ok"], ["取消", "cancel"]],
        onClose: (which, val) => resolve(which === "ok" ? (val == null ? "" : val) : "")
      });
    });
  }
  function buildModal(opt) {
    const layer = document.getElementById("modal-layer");
    const box = document.createElement("div"); box.className = "msgbox";
    const t = document.createElement("div"); t.className = "mb-title"; t.textContent = opt.title; box.appendChild(t);
    const b = document.createElement("div"); b.className = "mb-body";
    if (opt.icon) { const ic = document.createElement("div"); ic.className = "mb-icon"; ic.textContent = opt.icon; b.appendChild(ic); }
    const txt = document.createElement("div"); txt.textContent = opt.body; b.appendChild(txt);
    box.appendChild(b);
    let inputEl = null;
    if (opt.input != null) {
      const ip = document.createElement("div"); ip.className = "mb-input";
      inputEl = document.createElement("input"); inputEl.value = opt.input;
      ip.appendChild(inputEl); box.appendChild(ip);
    }
    const bb = document.createElement("div"); bb.className = "mb-btns";
    opt.buttons.forEach(([label, which]) => {
      const btn = document.createElement("button"); btn.textContent = label;
      btn.onclick = () => { close(which); };
      bb.appendChild(btn);
    });
    box.appendChild(bb);
    layer.innerHTML = ""; layer.appendChild(box); layer.classList.add("on");
    if (inputEl) { inputEl.focus(); inputEl.select(); inputEl.onkeydown = e => { if (e.key === "Enter") close("ok"); }; }
    function close(which) {
      layer.classList.remove("on"); layer.innerHTML = "";
      opt.onClose && opt.onClose(which, inputEl ? inputEl.value : undefined);
    }
  }

  // ===== window/form management =====
  const open = {};      // slug -> instance {win,canvas,controls,form,timers,state}
  const bySlug = {};    // map vb_name -> slug
  function slugOf(vbname) { return bySlug[vbname]; }

  function ctl(inst, name, idx) {
    const arr = inst.controls[name];
    if (!arr) return null;
    if (idx == null) return arr[0];
    return arr.find(e => String(e.dataset.index) === String(idx)) || arr[idx];
  }
  function setCap(el, v) { if (el) el.textContent = v == null ? "" : v; }
  function setVal(el, v) { if (el) el.value = v == null ? "" : v; }
  function getVal(el) { return el ? el.value : ""; }
  function show(el) { if (el) el.style.display = ""; }
  function hide(el) { if (el) el.style.display = "none"; }

  function centerWin(win) {
    const w = win.offsetWidth, h = win.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight - 30;
    win.style.left = Math.max(4, (vw - w) / 2) + "px";
    win.style.top = Math.max(4, (vh - h) / 2) + "px";
  }

  function showForm(vbname) {
    const slug = slugOf(vbname);
    if (!slug) { console.warn("no form", vbname); return null; }
    let inst = open[slug];
    if (!inst) {
      const form = LAYOUT.forms[slug];
      const r = VBRenderer.renderForm(form);
      inst = open[slug] = Object.assign(r, { timers: {}, state: {}, statics: {}, loaded: false });
      desktop().appendChild(r.win);
      makeDraggable(r.win);
      wireWindowButtons(inst);
      centerWin(r.win);
      const def = FORMS[vbname];
      if (def && def.load) def.load(inst);
      inst.loaded = true;
    }
    inst.win.style.display = "";
    bringToFront(inst.win);
    updateTaskbar(vbname);
    const def = FORMS[vbname];
    if (def && def.activate) def.activate(inst);
    return inst;
  }
  function hideForm(vbname) { const i = open[slugOf(vbname)]; if (i) i.win.style.display = "none"; }
  function unloadForm(vbname) {
    const slug = slugOf(vbname), i = open[slug];
    if (!i) return;
    for (const k in i.timers) clearInterval(i.timers[k]);
    i.win.remove();
    delete open[slug];
  }

  let zTop = 10;
  function bringToFront(win) { win.style.zIndex = ++zTop; }
  function makeDraggable(win) {
    const tb = win.querySelector(".titlebar");
    let sx, sy, ox, oy, drag = false;
    tb.addEventListener("mousedown", e => {
      drag = true; sx = e.clientX; sy = e.clientY;
      ox = parseInt(win.style.left) || 0; oy = parseInt(win.style.top) || 0;
      bringToFront(win); e.preventDefault();
    });
    window.addEventListener("mousemove", e => {
      if (!drag) return;
      win.style.left = (ox + e.clientX - sx) + "px";
      win.style.top = (oy + e.clientY - sy) + "px";
    });
    window.addEventListener("mouseup", () => drag = false);
  }
  function wireWindowButtons(inst) {
    const btns = inst.win.querySelectorAll(".titlebar .winbtn");
    btns[0].onclick = () => inst.win.style.display = "none";
    btns[2].onclick = () => { unloadForm(inst.form.vb_name); };
  }
  function updateTaskbar(vbname) {
    const el = document.querySelector("#taskbar .tb-title");
    if (el) el.textContent = "餐廳系統 — " + vbname;
  }

  // timer helper
  function setTimer(inst, name, interval, fn) {
    if (inst.timers[name]) return;
    inst.timers[name] = setInterval(fn, interval);
  }
  function clearTimer(inst, name) { if (inst.timers[name]) { clearInterval(inst.timers[name]); delete inst.timers[name]; } }

  // listbox helpers
  function listClear(el) { el._items = []; el._sel = -1; el.innerHTML = ""; }
  function listAdd(el, text) {
    el._items = el._items || [];
    el._items.push(text);
    const d = document.createElement("div"); d.className = "li"; d.textContent = text;
    d.onclick = () => { listSelect(el, el._items.indexOf(text)); el.dispatchEvent(new CustomEvent("vbclick")); };
    el.appendChild(d);
  }
  function listSelect(el, i) {
    el._sel = i;
    [...el.children].forEach((c, idx) => c.classList.toggle("sel", idx === i));
  }
  function listText(el) { return (el._sel >= 0 && el._items) ? el._items[el._sel] : ""; }

  // attach click handler to a control (handles control arrays / index)
  function on(inst, name, ev, fn) {
    const arr = inst.controls[name]; if (!arr) return;
    arr.forEach(el => {
      const idx = el.dataset.index != null ? Number(el.dataset.index) : undefined;
      el.addEventListener(ev, e => fn(e, idx, el));
    });
  }
  function onMenu(inst, name, fn) {
    const el = inst.win.querySelector(`[data-name="${name}"]`);
    if (el) el.addEventListener("click", fn);
  }

  // ===== shared session state (cross-form, like VB module/global) =====
  const S = {
    people: 0,           // 顧客人數
    reservedTables: "",  // 顧客訂單 text
    lastOrderText: "",   // 訂單顯示.Label7
    feedback: null,      // {name,sex,age,opinion}
  };

  // deduct ingredients string "a,b,c," with quantities "1,2,3,"
  function deduct(ingreStr, qtyStr, mult) {
    const names = String(ingreStr || "").split(",").filter(x => x !== "");
    const qtys = String(qtyStr || "").split(",").filter(x => x !== "");
    names.forEach((nm, i) => {
      const q = (Number(qtys[i]) || 0) * (mult || 1);
      const row = inventory.find(r => r["原料"] === nm);
      if (row) row["數量"] = Number(row["數量"]) - q;
      else inventory.push({ "原料": nm, "數量": 1000 - q, "成本": 5000, "保存期限": "2012/12/26" });
    });
  }

  // ============================================================
  //  Per-form logic (ported from the original VB6 event handlers)
  // ============================================================
  const FORMS = {};

  // ---------- 第一個畫面 ----------
  FORMS["第一個畫面"] = {
    load(inst) {
      let a = 0, z = 0, dir = 1;
      const L1 = ctl(inst, "Label1"), L5 = ctl(inst, "Label5");
      setTimer(inst, "marquee", 100, () => {
        if (dir > 0) { a += 1; if (a > 5) dir = -1; } else { a -= 1; if (a <= 1) dir = 1; }
        if (L1) { L1.style.color = dir > 0 ? "#ff0000" : "#0000ff";
          L1.textContent = Space(a) + (dir > 0 ? "★歡迎使用餐廳系統，此系統提供完善的服務☆" : "☆歡迎使用餐廳系統，此系統提供完善的服務★"); }
      });
      setTimer(inst, "clock", 1000, () => { if (L5) L5.textContent = "現在時間是" + new Date().toLocaleString(); });
      const tips = { Image2: ctl(inst, "Label4"), Image3: ctl(inst, "Label3"), Image4: ctl(inst, "Label2") };
      Object.entries(tips).forEach(([img, lab]) => {
        const ie = ctl(inst, img);
        if (ie && lab) ie.addEventListener("mousemove", () => { show(lab); clearTimeout(inst.state["t_" + img]); inst.state["t_" + img] = setTimeout(() => hide(lab), 1500); });
      });
      on(inst, "Command1", "click", () => { showForm("顧客系統選擇"); unloadForm("第一個畫面"); });
      on(inst, "Command2", "click", () => { showForm("廚師登入"); unloadForm("第一個畫面"); });
      on(inst, "Command3", "click", () => { showForm("管理者登入"); unloadForm("第一個畫面"); });
    }
  };

  // ---------- 顧客系統選擇 ----------
  FORMS["顧客系統選擇"] = {
    load(inst) {
      on(inst, "Command1", "click", () => { showForm("系統選擇菜單"); unloadForm("顧客系統選擇"); });
      on(inst, "Command2", "click", () => { showForm("套餐選擇"); unloadForm("顧客系統選擇"); });
      on(inst, "Image4", "click", () => { showForm("意見填寫"); });
      onMenu(inst, "cycle", () => { showForm("Form1"); unloadForm("顧客系統選擇"); });
      onMenu(inst, "goback", () => { showForm("第一個畫面"); unloadForm("顧客系統選擇"); });
      onMenu(inst, "aaa", () => { showForm("意見填寫"); unloadForm("顧客系統選擇"); });
      const tips = { Image2: ctl(inst, "Label2"), Image3: ctl(inst, "Label3"), Image4: ctl(inst, "Label4") };
      Object.entries(tips).forEach(([img, lab]) => {
        const ie = ctl(inst, img);
        if (ie && lab) ie.addEventListener("mousemove", () => { show(lab); clearTimeout(inst.state["t_" + img]); inst.state["t_" + img] = setTimeout(() => hide(lab), 1500); });
      });
    }
  };

  // ---------- 廚師登入 ----------
  FORMS["廚師登入"] = {
    load(inst) {
      let zz = 0; const L4 = ctl(inst, "Label4");
      setTimer(inst, "tip", 100, () => {
        zz += 1; if (L4) { show(L4);
          if (zz < 10) L4.textContent = "歡迎光臨～";
          else if (zz < 20) L4.textContent = "請先輸入帳號密碼哦";
          else if (zz < 30) L4.textContent = "一位大廚一定要會用餐廳系統!";
          else zz = 0; } });
      on(inst, "Command1", "click", async () => {
        if (getVal(ctl(inst, "Text1")) === "8137" && getVal(ctl(inst, "Text2")) === "8137") {
          await MsgBox("歡迎登入", 64, "餐廳系統貼心提醒"); showForm("新增菜單選擇"); unloadForm("廚師登入");
        } else { await MsgBox("帳號或密碼錯誤", 16, "餐廳系統貼心提醒"); const t2 = ctl(inst, "Text2"); t2 && t2.focus(); }
      });
      on(inst, "Command3", "click", () => { showForm("第一個畫面"); unloadForm("廚師登入"); });
      onMenu(inst, "goback", () => { showForm("第一個畫面"); unloadForm("廚師登入"); });
    }
  };

  // ---------- 管理者登入 ----------
  FORMS["管理者登入"] = {
    load(inst) {
      const L4 = ctl(inst, "Label4"), L6 = ctl(inst, "Label6");
      const gen = () => String(Math.floor(Math.random() * 9000) + 1000);
      setCap(L4, gen());
      let gg = 0;
      setTimer(inst, "tip", 100, () => { gg += 1; if (L6) { show(L6);
        if (gg < 10) L6.textContent = "歡迎光臨～";
        else if (gg < 20) L6.textContent = "請先輸入帳號密碼哦";
        else if (gg < 30) L6.textContent = "此介面提供管理者存貨管理!";
        else gg = 0; } });
      on(inst, "Command2", "click", () => setCap(L4, gen()));
      on(inst, "Command1", "click", async () => {
        const t1 = getVal(ctl(inst, "Text1")), t2 = getVal(ctl(inst, "Text2")), t3 = getVal(ctl(inst, "Text3"));
        if (t1 === "8137" && t2 === "8137" && t3 === L4.textContent) {
          await MsgBox("歡迎使用", 64, "帳密正確"); showForm("目前所有存貨"); unloadForm("管理者登入");
        } else { await MsgBox("帳號或密碼錯誤", 16, "錯誤訊息"); setVal(ctl(inst, "Text1"), ""); setVal(ctl(inst, "Text2"), ""); setVal(ctl(inst, "Text3"), ""); }
      });
      onMenu(inst, "goback", () => { showForm("第一個畫面"); unloadForm("管理者登入"); });
    }
  };

  // ---------- 系統選擇菜單 (consumer a-la-carte ordering) ----------
  FORMS["系統選擇菜單"] = {
    load(inst) {
      const st = inst.state;
      st.budget = 0; st.items = []; // {name,qty,price,pic}
      // build flavor checkboxes (Labelcheck array) from distinct 口味
      const flavors = [...new Set(menu.map(m => m["口味"]).filter(x => x && x !== "全" && x !== "全*"))];
      st.flavors = flavors;
      // categories (分類)
      st.cats = [...new Set(menu.map(m => m["分類"]))];
      wireMenuForm(inst);
    },
    async activate(inst) {
      const st = inst.state;
      if (st.activated) return; st.activated = true;
      let ppl = "";
      while (!(Number(ppl) > 0)) ppl = await InputBox("請輸入顧客人數：", "系統資訊");
      S.people = Number(ppl); setVal(ctl(inst, "Text4"), ppl);
      let bud = "";
      while (!(Number(bud) > 0)) bud = await InputBox("請輸入預算", "餐廳系統的熱心提示", 1000);
      st.budget = Number(bud);
      setVal(ctl(inst, "Text1"), String(st.budget));
      const L4 = ctl(inst, "Label4"); if (L4) L4.textContent = "您目前金額尚有" + st.budget;
      fillMenuLists(inst);
    }
  };
  function wireMenuForm(inst) {
    const st = inst.state;
    // These frames are Visible=False in the .frm and shown by runtime code in
    // the original; reveal the main ordering UI (口味 / 菜單選擇 / 點菜).
    ["Frame2", "Frame4", "Frame5"].forEach(fn => { const fr = ctl(inst, fn); if (fr) fr.style.display = ""; });
    // Map the real List1(1..N) control-array elements to each 分類 category.
    st.catLists = {};
    st.cats.forEach((cat, i) => { const e = ctl(inst, "List1", i + 1); if (e) { st.catLists[cat] = e; e.style.display = ""; } });
    // hide unused category lists (List1(N+1)..List1(12)) and the work lists
    for (let i = st.cats.length + 1; i <= 13; i++) { const e = ctl(inst, "List1", i); if (e) e.style.display = "none"; }
    const w0 = ctl(inst, "List1", 0); if (w0) w0.style.display = "none";

    // Flavor checkboxes (Labelcheck array). Labelcheck(0)=全, (1..N)=flavors.
    st.flavorBoxes = [];
    const allBox = ctl(inst, "Labelcheck", 0);
    if (allBox) { allBox.querySelector("span").textContent = "全部"; allBox.style.display = ""; allBox._box.onchange = () => { st.flavorBoxes.forEach(cb => cb._box.checked = allBox._box.checked); fillMenuLists(inst); }; }
    st.flavors.forEach((fv, i) => {
      const cb = ctl(inst, "Labelcheck", i + 1);
      if (cb) { cb.querySelector("span").textContent = fv; cb.dataset.flavor = fv; cb.style.display = ""; cb._box.onchange = () => fillMenuLists(inst); st.flavorBoxes.push(cb); }
    });
    for (let i = st.flavors.length + 1; i <= 23; i++) { const cb = ctl(inst, "Labelcheck", i); if (cb) cb.style.display = "none"; }

    // hide all remove (X) buttons initially
    for (let i = 0; i <= 15; i++) { const b = ctl(inst, "Command1", i); if (b) b.style.display = "none"; }

    const Text1 = ctl(inst, "Text1"), Label4 = ctl(inst, "Label4");
    if (Text1) Text1.addEventListener("input", () => { if (Label4) Label4.textContent = "您目前金額尚有" + Text1.value; });
    const t3 = ctl(inst, "Text3"); if (t3) t3.value = "";

    on(inst, "Command2", "click", async () => { // 重新輸入預算
      let bud = ""; while (!(Number(bud) > 0)) bud = await InputBox("請輸入預算", "餐廳系統的熱心提示", 1000);
      st.budget = Number(bud); setVal(Text1, String(st.budget)); if (Label4) Label4.textContent = "您目前金額尚有" + bud;
      st.items = []; renderOrder(inst); fillMenuLists(inst);
    });
    on(inst, "Command4", "click", () => checkoutMenu(inst)); // 送出點餐
    onMenu(inst, "meal", () => { showForm("套餐選擇"); unloadForm("系統選擇菜單"); });
    onMenu(inst, "goback", () => { showForm("第一個畫面"); unloadForm("系統選擇菜單"); });
    onMenu(inst, "cycle", () => { showForm("Form1"); });
    onMenu(inst, "play", () => { showForm("Form1"); });
    onMenu(inst, "aaa", () => { showForm("消費者訂位"); });
    on(inst, "Image4", "click", () => showForm("意見填寫"));
  }
  function selectedFlavors(inst) {
    const picked = inst.state.flavorBoxes.filter(cb => cb._box.checked).map(cb => cb.dataset.flavor);
    return picked.length ? picked : inst.state.flavors.slice(); // none = all
  }
  // Fill each category List1 with header + matching dishes (original Timer1 logic).
  function fillMenuLists(inst) {
    const st = inst.state;
    const budget = Number(getVal(ctl(inst, "Text1"))) || 0;
    const flv = selectedFlavors(inst);
    st.cats.forEach(cat => {
      const lb = st.catLists[cat]; if (!lb) return;
      lb.innerHTML = ""; lb._items = []; lb._sel = -1;
      addMenuItem(inst, lb, "******" + cat + "******", null);
      menu.filter(m => m["分類"] === cat && flv.includes(m["口味"]) && Number(m["價錢"]) <= budget && !st.items.find(it => it.name === m["菜名"]))
        .forEach(m => addMenuItem(inst, lb, m["菜名"] + "-" + m["價錢"] + "圓", m));
    });
  }
  function addMenuItem(inst, lb, text, dish) {
    lb._items.push(text);
    const d = document.createElement("div"); d.className = "li"; d.textContent = text;
    if (dish) {
      d.onclick = () => { [...lb.parentElement.querySelectorAll(".ctl-list .li.sel")].forEach(x => x.classList.remove("sel")); d.classList.add("sel"); showDishInfo(inst, dish); };
      d.ondblclick = () => addDish(inst, dish);
    } else { d.style.fontWeight = "bold"; d.style.background = "#dde"; }
    lb.appendChild(d);
  }
  function showDishInfo(inst, m) {
    const img = ctl(inst, "Image1"), t3 = ctl(inst, "Text3");
    if (img) { img.classList.remove("noimg"); img.src = m["圖片路徑"] || "assets/img/image/NO.jpg"; img.onerror = () => { img.classList.add("noimg"); img.removeAttribute("src"); }; }
    if (t3) { t3.style.display = ""; t3.value = m["資訊"] || ""; }
  }
  async function addDish(inst, m) {
    const st = inst.state;
    let qtyS = await InputBox("輸入該餐點數量", "餐廳系統的熱心提示", 1);
    let qty = Number(qtyS);
    if (!(qty > 0)) { await MsgBox("請勿隨意輸入", 16, "餐廳系統的熱心提示"); qty = 1; }
    const price = Number(m["價錢"]);
    let bud = Number(getVal(ctl(inst, "Text1")));
    if (bud - qty * price >= 0) {
      bud -= qty * price; setVal(ctl(inst, "Text1"), String(bud));
      const Label4 = ctl(inst, "Label4"); if (Label4) Label4.textContent = "您目前金額尚有" + bud;
      st.items.push({ name: m["菜名"], qty, price, pic: m["圖片路徑"], ingre: m["原料"], qstr: m["原料數量"] });
      renderOrder(inst); fillMenuLists(inst);
    } else { await MsgBox("您的金額不足", 16, "餐廳系統的熱心提示"); }
  }
  function removeItem(inst, i) {
    const st = inst.state, it = st.items[i]; if (!it) return;
    const b = Number(getVal(ctl(inst, "Text1"))) + it.qty * it.price;
    setVal(ctl(inst, "Text1"), String(b));
    const L4 = ctl(inst, "Label4"); if (L4) L4.textContent = "您目前金額尚有" + b;
    st.items.splice(i, 1); renderOrder(inst); fillMenuLists(inst);
  }
  function renderOrder(inst) {
    const st = inst.state;
    const L5 = ctl(inst, "Label5"), L6 = ctl(inst, "Label6"), L7 = ctl(inst, "Label7");
    let s5 = "", s6 = "", s7 = "";
    st.items.forEach((it, i) => {
      s5 += vbCrLf + (i + 1) + "----" + it.name;
      s6 += vbCrLf + it.qty;
      s7 += vbCrLf + (it.qty * it.price);
    });
    setCap(L5, s5); setCap(L6, s6); setCap(L7, s7);
    // Command1(1..n) X buttons remove each ordered item (original behaviour).
    for (let i = 0; i <= 15; i++) {
      const b = ctl(inst, "Command1", i); if (!b) continue;
      if (i >= 1 && i <= st.items.length) { b.style.display = ""; b.onclick = () => removeItem(inst, i - 1); }
      else b.style.display = "none";
    }
  }
  async function checkoutMenu(inst) {
    const st = inst.state;
    if (!st.items.length) { await MsgBox("請先點餐", 64, "餐廳系統的熱心提示"); return; }
    const ppl = Number(getVal(ctl(inst, "Text4"))) || S.people || 1;
    let m = ppl <= 10 ? 1 : Math.floor(ppl / 10) + ((ppl % 10) >= 5 ? 1 : 0);
    setVal(ctl(inst, "Text5"), String(m));
    let temp = "";
    st.items.forEach(it => temp += it.name + vbTab + it.qty + "份" + vbTab + vbCrLf);
    const spent = st.items.reduce((s, it) => s + it.qty * it.price, 0);
    const ans = await MsgBox(temp + vbCrLf + "您共花了：" + spent + vbCrLf + "人數：" + ppl + "人" + vbCrLf + "最多可訂 " + m + " 桌", VB_YESNO);
    S.lastOrderText = temp + vbCrLf + "總計金額：" + spent;
    if (ans === "yes") {
      st.items.forEach(it => deduct(it.ingre, it.qstr, it.qty));
      st.items = []; st.activated = false;
      showForm("訂單處理中"); unloadForm("系統選擇菜單");
    } else {
      await MsgBox("請您慢慢考慮", 64, "餐廳系統的熱心提示");
    }
  }

  // ---------- 套餐選擇 (set-meal ordering) ----------
  FORMS["套餐選擇"] = {
    load(inst) {
      const Combo1 = ctl(inst, "Combo1");
      ["全部套餐", "豪華餐", "經濟餐", "養生餐", "快樂兒童餐"].forEach(o => { const op = document.createElement("option"); op.textContent = o; Combo1.appendChild(op); });
      const List1 = ctl(inst, "List1"), List2 = ctl(inst, "List2");
      function fillList1(cat) {
        listClear(List1);
        combo.forEach(c => { if (!cat || cat === "全部套餐" || (c["分類"] || "").trim() === cat) listAdd(List1, c["套餐名"]); });
      }
      inst.state.fillList1 = fillList1;
      Combo1.onchange = () => fillList1(Combo1.value);
      List1.addEventListener("vbclick", () => {
        const name = listText(List1);
        const c = combo.find(x => x["套餐名"] === name); if (!c) return;
        setVal(ctl(inst, "Text2"), c["資訊"]);
        setVal(ctl(inst, "Text3"), String(c["價錢"]).trim());
        listClear(List2);
        ["料理A", "料理B", "料理C", "料理D", "料理E", "料理F", "料理G", "料理H", "料理I", "料理J"].forEach(k => { const v = (c[k] || "").trim(); if (v) listAdd(List2, v); });
        inst.state.cur = c;
      });
      on(inst, "Command7", "click", async () => { // 確定套餐
        if (List1._sel >= 0) {
          setCap(ctl(inst, "Label10"), "套餐：" + listText(List1));
          setCap(ctl(inst, "Label11"), "價錢：" + getVal(ctl(inst, "Text3")));
        } else { await MsgBox("  請選擇套餐", 64, "系統資訊"); }
      });
      on(inst, "Command5", "click", () => orderCombo(inst)); // 結帳
      on(inst, "Command6", "click", () => { showForm("第一個畫面"); unloadForm("套餐選擇"); });
      on(inst, "Command8", "click", () => resetCombo(inst));
      onMenu(inst, "meal", () => { showForm("系統選擇菜單"); unloadForm("套餐選擇"); });
      onMenu(inst, "goback", () => { showForm("第一個畫面"); unloadForm("套餐選擇"); });
      onMenu(inst, "play", () => showForm("Form1"));
      onMenu(inst, "cc", () => { showForm("消費者訂位"); unloadForm("套餐選擇"); });
      on(inst, "Image4", "click", () => showForm("意見填寫"));
    },
    async activate(inst) {
      if (inst.state.act) { return; } inst.state.act = true;
      await MsgBox("此套餐系統適合10人以上團體點餐", 64, "餐廳系統的熱心提醒");
      let ppl = ""; while (!(Number(ppl) > 0)) ppl = await InputBox("請輸入顧客人數：", "系統資訊");
      S.people = Number(ppl); setVal(ctl(inst, "Text5"), ppl);
      inst.state.fillList1("全部套餐");
    }
  };
  function resetCombo(inst) {
    setCap(ctl(inst, "Label10"), ""); setCap(ctl(inst, "Label11"), "");
    listClear(ctl(inst, "List2"));
    inst.state.fillList1("全部套餐");
    ["Text1", "Text2", "Text3", "Text4"].forEach(t => setVal(ctl(inst, t), ""));
    ctl(inst, "Combo1").value = "全部套餐";
  }
  async function orderCombo(inst) {
    const c = inst.state.cur;
    if (!getCap(ctl(inst, "Label10")) || !c) { await MsgBox("請先確定套餐", 16, "系統資訊"); return; }
    const ppl = Number(getVal(ctl(inst, "Text5"))) || 1;
    const m = ppl <= 10 ? 1 : Math.floor(ppl / 10) + ((ppl % 10) >= 5 ? 1 : 0);
    setVal(ctl(inst, "Text6"), String(m));
    const dishes = ["料理A", "料理B", "料理C", "料理D", "料理E", "料理F", "料理G", "料理H", "料理I", "料理J"].map(k => (c[k] || "").trim()).filter(Boolean);
    const body = "您所選擇的是：" + c["套餐名"] + vbCrLf + vbCrLf + "套餐菜色：" + vbCrLf + vbCrLf + dishes.join(vbCrLf) + vbCrLf + vbCrLf + "價錢：" + getVal(ctl(inst, "Text3")) + vbCrLf + "人數：" + ppl + "人" + vbCrLf + "最多可訂 " + m + " 桌";
    const ans = await MsgBox(body, VB_YESNO, "系統資訊");
    S.lastOrderText = c["套餐名"] + vbCrLf + "套餐菜色：" + vbCrLf + vbCrLf + dishes.join(vbCrLf) + vbCrLf + vbCrLf + "價錢：" + String(c["價錢"]).trim();
    if (ans === "yes") {
      deduct(c["原料"], c["原料數量"], 1);
      showForm("訂單處理中"); unloadForm("套餐選擇");
    } else { await MsgBox("請您慢慢考慮", 64, "系統資訊"); }
  }
  function getCap(el) { return el ? el.textContent : ""; }

  // ---------- 訂單處理中 ----------
  FORMS["訂單處理中"] = {
    load(inst) {
      let a = 0; const L2 = ctl(inst, "Label2"); const C1 = ctl(inst, "Command1");
      if (C1) C1.disabled = true;
      setTimer(inst, "wait", 100, () => {
        a += 1; if (L2) {
          if (a < 5) L2.textContent = "請稍候.";
          else if (a < 10) L2.textContent = "請稍候..";
          else if (a < 15) L2.textContent = "請稍候...";
          else if (a < 20) L2.textContent = "請稍候....";
        }
        if (a >= 20) { if (C1) C1.disabled = false; clearTimer(inst, "wait"); }
      });
      on(inst, "Command1", "click", () => { unloadForm("訂單處理中"); showForm("消費者訂位"); });
    }
  };

  // ---------- 消費者訂位 (table reservation) ----------
  FORMS["消費者訂位"] = {
    load(inst) {
      const st = inst.state; st.tables = {};
      for (let i = 1; i <= 20; i++) {
        const img = ctl(inst, "Image" + i), lab = ctl(inst, "Label" + i);
        if (!img) continue;
        img.classList.remove("noimg"); img.src = "assets/img/image/綠-按鈕.bmp";
        img.style.cursor = "pointer";
        img.onclick = () => {
          if (!st.tables[i]) { img.src = "assets/img/image/紅-按鈕.bmp"; st.tables[i] = (lab ? lab.textContent : i) + "桌"; }
          else { img.src = "assets/img/image/綠-按鈕.bmp"; st.tables[i] = null; }
        };
      }
      on(inst, "Command1", "click", async () => {
        const xx = Number(getVal(ctl(inst, "Text2"))) || S.people;
        const picked = Object.values(st.tables).filter(Boolean);
        const cap = picked.length * 10;
        if (cap >= xx) {
          S.reservedTables = picked.map(t => Space(3) + t).join("");
          if (S.reservedTables) { await MsgBox("感謝您的光臨", 64, "餐廳系統"); showForm("顧客訂單"); unloadForm("消費者訂位"); }
        } else { await MsgBox("桌數超過來客人數", 16, "餐廳系統"); for (let i = 1; i <= 20; i++) { st.tables[i] = null; const im = ctl(inst, "Image" + i); if (im) im.src = "assets/img/image/綠-按鈕.bmp"; } }
      });
      on(inst, "Command2", "click", () => { S.reservedTables = "（ 無 ）"; showForm("顧客訂單"); unloadForm("消費者訂位"); });
      onMenu(inst, "bb", () => { showForm("系統選擇菜單"); unloadForm("消費者訂位"); });
      onMenu(inst, "cc", () => { showForm("套餐選擇"); unloadForm("消費者訂位"); });
      onMenu(inst, "dd", () => { showForm("Form1"); unloadForm("消費者訂位"); });
    },
    activate(inst) {
      setVal(ctl(inst, "Text2"), String(S.people || ""));
      MsgBox("請選擇您所要預定的用餐位置", 64, "餐廳系統的熱心服務");
    }
  };

  // ---------- 顧客訂單 ----------
  FORMS["顧客訂單"] = {
    activate(inst) {
      setVal(ctl(inst, "Text1"), S.reservedTables);
      on(inst, "Command1", "click", () => { showForm("第一個畫面"); unloadForm("顧客訂單"); });
    },
    load(inst) {
      on(inst, "Command1", "click", () => { showForm("第一個畫面"); unloadForm("顧客訂單"); });
    }
  };

  // ---------- 意見填寫 ----------
  FORMS["意見填寫"] = {
    load(inst) {
      const Combo1 = ctl(inst, "Combo1");
      ["請選擇", "10~15歲", "16~20歲", "21~25歲", "26~30歲", "31~35歲", "40歲以上"].forEach(o => { const op = document.createElement("option"); op.textContent = o; Combo1.appendChild(op); });
      on(inst, "Command1", "click", async () => {
        const name = getVal(ctl(inst, "Text1")), op = getVal(ctl(inst, "Text2"));
        const o1 = ctl(inst, "Option1")._box.checked, o2 = ctl(inst, "Option2")._box.checked;
        if (!name) { await MsgBox("請輸入您的姓名", 16, "系統資訊"); return; }
        if (!o1 && !o2) { await MsgBox("請選擇性別", 16, "系統資訊"); return; }
        if (Combo1.value === "請選擇") { await MsgBox("請選擇年齡", 16, "系統資訊"); return; }
        if (!op) { await MsgBox("請輸入您的意見", 16, "系統資訊"); return; }
        S.feedback = { name, sex: o1 ? "男生" : "女生", age: Combo1.value, opinion: op };
        await MsgBox("成功送出", 64, "系統資訊");
        unloadForm("意見填寫");
      });
      on(inst, "Command2", "click", () => { setVal(ctl(inst, "Text1"), ""); setVal(ctl(inst, "Text2"), ""); ctl(inst, "Option1")._box.checked = false; ctl(inst, "Option2")._box.checked = false; Combo1.value = "請選擇"; });
      on(inst, "Command3", "click", () => { showForm("顧客系統選擇"); unloadForm("意見填寫"); });
    }
  };

  // ---------- 顧客意見顯示 ----------
  FORMS["顧客意見顯示"] = {
    activate(inst) {
      const f = S.feedback;
      if (f) {
        setCap(ctl(inst, "Label1"), "姓名" + Space(3) + f.name);
        setCap(ctl(inst, "Label2"), "性別" + Space(3) + f.sex);
        setCap(ctl(inst, "Label3"), "年齡" + Space(3) + f.age);
        setCap(ctl(inst, "Label4"), "顧客意見反應" + vbCrLf + f.opinion);
      }
      on(inst, "Command1", "click", () => { showForm("新增菜單選擇"); unloadForm("顧客意見顯示"); });
    },
    load(inst) { on(inst, "Command1", "click", () => { showForm("新增菜單選擇"); unloadForm("顧客意見顯示"); }); }
  };

  // ---------- 新增菜單選擇 (chef hub) ----------
  FORMS["新增菜單選擇"] = {
    load(inst) {
      on(inst, "Command1", "click", () => { showForm("新增菜單"); unloadForm("新增菜單選擇"); });
      on(inst, "Command2", "click", () => { showForm("新增套餐"); unloadForm("新增菜單選擇"); });
      on(inst, "Image4", "click", () => { showForm("顧客意見顯示"); unloadForm("新增菜單選擇"); });
      onMenu(inst, "goback", () => { showForm("第一個畫面"); unloadForm("新增菜單選擇"); });
      onMenu(inst, "sss", async () => { if (S.feedback) { showForm("顧客意見顯示"); unloadForm("新增菜單選擇"); } else await MsgBox("尚無訊息", 64, "餐廳系統熱心提醒"); });
      // new-message indicator
      const img4 = ctl(inst, "Image4"), lab1 = ctl(inst, "Label1");
      if (S.feedback) { show(img4); show(lab1); } else { hide(img4); hide(lab1); }
    },
    activate(inst) { if (S.feedback) MsgBox("您有新訊息", 64, "餐廳系統熱心提醒"); }
  };

  // ---------- 新增菜單 (chef add dish) ----------
  FORMS["新增菜單"] = {
    load(inst) {
      on(inst, "Command1", "click", async () => {
        const g = k => getVal(ctl(inst, k));
        const row = { "菜名": g("Text1"), "卡路里": g("Text2"), "原料": g("Text3") + ",", "原料數量": g("Text4") + ",", "資訊": g("Text5"), "產地": g("Text6"), "分類": g("Text7"), "口味": g("Text8"), "價錢": Number(g("Text9")) || 0, "圖片路徑": "" };
        menu.push(row);
        ["Text1", "Text2", "Text3", "Text4", "Text5", "Text6", "Text7", "Text8", "Text9"].forEach(t => setVal(ctl(inst, t), ""));
        await MsgBox("新增成功：" + row["菜名"], 64, "餐廳系統");
      });
      on(inst, "Command2", "click", () => { showForm("新增菜單選擇"); unloadForm("新增菜單"); });
      on(inst, "selectmeal", "click", () => { showForm("新增菜單選擇"); unloadForm("新增菜單"); });
      onMenu(inst, "goback", () => { showForm("第一個畫面"); unloadForm("新增菜單"); });
    }
  };

  // ---------- 新增套餐 (chef add combo) ----------
  FORMS["新增套餐"] = {
    load(inst) {
      const List1 = ctl(inst, "List1"); const Combo1 = ctl(inst, "Combo1");
      ["豪華餐", "經濟餐", "養生餐", "快樂兒童餐"].forEach(o => { const op = document.createElement("option"); op.textContent = o; Combo1.appendChild(op); });
      inst.state.picked = new Set();
      function fill() { listClear(List1); menu.forEach(m => listAdd(List1, m["菜名"] + vbTab + m["價錢"])); }
      fill();
      // allow multi-pick (max 10)
      List1.addEventListener("vbclick", () => {
        const t = listText(List1); const name = t.split(vbTab)[0];
        const st = inst.state;
        if (st.picked.has(name)) st.picked.delete(name); else { if (st.picked.size >= 10) { MsgBox("已選取十道料理", 64, "提醒"); return; } st.picked.add(name); }
        // visual mark
        [...List1.children].forEach(ch => { const nm = ch.textContent.split(vbTab)[0]; ch.style.fontWeight = st.picked.has(nm) ? "bold" : ""; ch.style.background = st.picked.has(nm) ? "#bfe" : ""; });
        setCap(ctl(inst, "Label10"), String(10 - st.picked.size));
        const sel = [...st.picked].map(n => menu.find(m => m["菜名"] === n)).filter(Boolean);
        const total = sel.reduce((s, m) => s + Number(m["價錢"]), 0);
        setVal(ctl(inst, "Text2"), String(Math.round(total * 0.85)));
        const last = sel[sel.length - 1];
        if (last) { setCap(ctl(inst, "Label4"), last["原料"]); setCap(ctl(inst, "Label5"), last["原料數量"]); setCap(ctl(inst, "Label6"), last["資訊"]); }
      });
      on(inst, "Command1", "click", async () => {
        const st = inst.state;
        const sel = [...st.picked].map(n => menu.find(m => m["菜名"] === n)).filter(Boolean);
        const row = { "套餐名": getVal(ctl(inst, "Text1")), "分類": Combo1.value, "價錢": Number(getVal(ctl(inst, "Text2"))) || 0, "資訊": getVal(ctl(inst, "Text3")), "原料": "", "原料數量": "" };
        ["料理A", "料理B", "料理C", "料理D", "料理E", "料理F", "料理G", "料理H", "料理I", "料理J"].forEach((k, i) => row[k] = sel[i] ? sel[i]["菜名"] : "");
        // aggregate ingredients
        const agg = {};
        sel.forEach(m => { const ns = (m["原料"] || "").split(",").filter(Boolean); const qs = (m["原料數量"] || "").split(",").filter(Boolean); ns.forEach((nm, i) => agg[nm] = (agg[nm] || 0) + (Number(qs[i]) || 0)); });
        row["原料"] = Object.keys(agg).map(k => k + ",").join(""); row["原料數量"] = Object.values(agg).map(v => v + ",").join("");
        combo.push(row);
        await MsgBox("新增套餐成功：" + row["套餐名"], 64, "提醒");
        st.picked.clear(); ["Text1", "Text2", "Text3"].forEach(t => setVal(ctl(inst, t), "")); setCap(ctl(inst, "Label10"), "10"); fill();
        showForm("新增菜單選擇"); unloadForm("新增套餐");
      });
      on(inst, "Command2", "click", () => { showForm("新增菜單選擇"); unloadForm("新增套餐"); });
      on(inst, "select", "click", () => { showForm("新增菜單選擇"); unloadForm("新增套餐"); });
      onMenu(inst, "goback", () => { showForm("第一個畫面"); unloadForm("新增套餐"); });
    }
  };

  // ---------- 目前所有存貨 (admin inventory) ----------
  FORMS["目前所有存貨"] = {
    load(inst) {
      const List1 = ctl(inst, "List1");
      const Combo1 = ctl(inst, "Combo1"), Combo2 = ctl(inst, "Combo2"), Combo3 = ctl(inst, "Combo3");
      ["12 pt", "14 pt", "16 pt", "18 pt", "20 pt", "22 pt"].forEach(o => addOpt(Combo1, o));
      ["Black", "Pink", "Yellow", "Purple", "Orange", "Blue", "Red"].forEach(o => addOpt(Combo2, o));
      ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"].forEach(o => addOpt(Combo3, o));
      function refresh() {
        listClear(List1); listAdd(List1, "原料" + vbTab + "數量" + vbTab + "成本" + vbTab + "保存期限");
        inventory.forEach(r => listAdd(List1, r["原料"] + vbTab + r["數量"] + vbTab + r["成本"] + vbTab + r["保存期限"]));
        setCap(ctl(inst, "Label9"), String(inventory.length));
        const total = inventory.reduce((s, r) => s + Number(r["數量"]) * Number(r["成本"]), 0);
        setCap(ctl(inst, "Label11"), total.toLocaleString("en-US"));
      }
      inst.state.refresh = refresh;
      if (Combo1) Combo1.onchange = () => List1.style.fontSize = [12, 14, 16, 18, 20, 22][Combo1.selectedIndex] * 96 / 72 + "px";
      if (Combo2) Combo2.onchange = () => List1.style.color = ["#000", "#ff8080", "#ffff00", "#ff00ff", "#ff8000", "#0000ff", "#ff0000"][Combo2.selectedIndex];
      if (Combo3) Combo3.onchange = () => {
        const mo = Combo3.selectedIndex + 1;
        listClear(List1); listAdd(List1, "原料" + vbTab + "數量" + vbTab + "成本" + vbTab + "保存期限");
        let cnt = 0;
        inventory.forEach(r => { const m = Number(String(r["保存期限"]).slice(5, 7)); if (m === mo) { listAdd(List1, r["原料"] + vbTab + r["數量"] + vbTab + r["成本"] + vbTab + r["保存期限"]); cnt++; } });
        setCap(ctl(inst, "Label4"), cnt ? (mo + "月原料訊息") : "本月無原料");
        if (!cnt) MsgBox("本月尚無任何原料", 16, "訊息");
      };
      ["Check1", "Check2", "Check3"].forEach((c, i) => { const ce = ctl(inst, c); if (ce) ce._box.onchange = () => { List1.style.fontWeight = ctl(inst, "Check1")._box.checked ? "bold" : ""; List1.style.fontStyle = ctl(inst, "Check2")._box.checked ? "italic" : ""; List1.style.textDecoration = ctl(inst, "Check3")._box.checked ? "underline" : ""; }; });
      on(inst, "Command1", "click", () => sortAndExpire(inst)); // 日期排序+過期
      on(inst, "Command2", "click", refresh); // 更新存貨
      on(inst, "Command3", "click", async () => { // 查詢
        const n = await InputBox("輸入原料名稱", "我要查詢");
        const r = inventory.find(x => x["原料"] === n);
        if (r) { const f = showForm("原料查詢"); setCap(ctl(f, "Label1"), "原料:" + r["原料"] + vbCrLf + "數量:" + r["數量"] + vbCrLf + "成本:" + r["成本"] + vbCrLf + vbCrLf + "保存期限:" + r["保存期限"]); }
        else await MsgBox("無此原料", 16, "餐廳系統貼心提醒");
      });
      on(inst, "Command5", "click", () => remainDays(inst));
      on(inst, "Command6", "click", () => { // 刪除
        const i = List1._sel; if (i > 0 && inventory[i - 1]) { const nm = inventory[i - 1]["原料"]; inventory.splice(i - 1, 1); MsgBox("已刪除" + nm, 16, "餐廳系統貼心提醒"); refresh(); }
      });
      on(inst, "Command7", "click", () => { showForm("新增存貨"); });
      on(inst, "Command4", "click", () => { showForm("第一個畫面"); unloadForm("目前所有存貨"); });
      on(inst, "add", "click", () => { showForm("新增存貨"); unloadForm("目前所有存貨"); });
      onMenu(inst, "goback", () => { showForm("第一個畫面"); unloadForm("目前所有存貨"); });
      onMenu(inst, "play", () => { showForm("Form1"); unloadForm("目前所有存貨"); });
      setTimer(inst, "clock", 1000, () => setVal(ctl(inst, "Text1"), new Date().toLocaleTimeString()));
      setCap(ctl(inst, "Label2"), "現在日期是：" + new Date().toLocaleDateString());
      refresh();
    },
    activate(inst) { inst.state.refresh && inst.state.refresh(); }
  };
  function addOpt(sel, t) { if (!sel) return; const o = document.createElement("option"); o.textContent = t; sel.appendChild(o); }
  function sortAndExpire(inst) {
    const List1 = ctl(inst, "List1");
    const sorted = inventory.slice().sort((a, b) => String(a["保存期限"]).replace(/\//g, "") > String(b["保存期限"]).replace(/\//g, "") ? 1 : -1);
    listClear(List1); listAdd(List1, "原料" + vbTab + "數量" + vbTab + "成本" + vbTab + "保存期限");
    sorted.forEach(r => listAdd(List1, r["原料"] + vbTab + r["數量"] + vbTab + r["成本"] + vbTab + r["保存期限"]));
    setCap(ctl(inst, "Label4"), "日期排序");
    // expired
    const today = new Date();
    const p = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
    let txt = "";
    inventory.forEach(r => { const s = String(r["保存期限"]); const v = Number(s.slice(0, 4)) * 10000 + Number(s.slice(5, 7)) * 100 + (Number(s.slice(8, 10)) + 5); if (v < p) txt += vbCrLf + r["原料"] + Space(5) + r["保存期限"] + vbCrLf; });
    MsgBox(txt || "（無過期原料）", 0, "過期原料");
    const f = showForm("過期存貨");
    setCap(ctl(f, "Label1"), "原料" + Space(5) + "日期" + vbCrLf + txt);
  }
  function remainDays(inst) {
    const List1 = ctl(inst, "List1");
    const today = new Date(); const Y = today.getFullYear(), M = today.getMonth() + 1, D = today.getDate();
    listClear(List1); listAdd(List1, "原料" + vbTab + "數量" + vbTab + "成本" + vbTab + "保存期限" + vbTab + "剩餘日期");
    inventory.forEach(r => {
      const s = String(r["保存期限"]); const y1 = Number(s.slice(0, 4)), m1 = Number(s.slice(5, 7)), d1 = Number(s.slice(8, 10));
      let z = (y1 - Y) * 365 + (m1 - 1) * 30 + d1 - ((M - 1) * 30 + D); if (z < 0) z = 0;
      listAdd(List1, r["原料"] + vbTab + r["數量"] + vbTab + r["成本"] + vbTab + r["保存期限"] + vbTab + z + "天");
    });
    setCap(ctl(inst, "Label4"), "剩餘天數");
  }

  // ---------- 新增存貨 ----------
  FORMS["新增存貨"] = {
    load(inst) {
      on(inst, "Command1", "click", async () => {
        const d = getVal(ctl(inst, "Text5"));
        if (d.length !== 10) { await MsgBox("日期有誤", 0, "新增存貨"); return; }
        inventory.push({ "原料": getVal(ctl(inst, "Text1")), "數量": Number(getVal(ctl(inst, "Text2"))) || 0, "成本": Number(getVal(ctl(inst, "Text3"))) || 0, "保存期限": d });
        await MsgBox("新增成功", 64, "新增存貨");
        ["Text1", "Text2", "Text3", "Text5"].forEach(t => setVal(ctl(inst, t), ""));
      });
      on(inst, "Command2", "click", () => { showForm("目前所有存貨"); unloadForm("新增存貨"); });
      on(inst, "now", "click", () => { showForm("目前所有存貨"); unloadForm("新增存貨"); });
      onMenu(inst, "goback", () => { showForm("第一個畫面"); unloadForm("新增存貨"); });
      onMenu(inst, "play", () => { showForm("Form1"); unloadForm("新增存貨"); });
    }
  };

  // ---------- 過期存貨 / 原料查詢 (display only) ----------
  FORMS["過期存貨"] = { load(inst) { on(inst, "Command1", "click", () => unloadForm("過期存貨")); } };
  FORMS["原料查詢"] = { load(inst) { on(inst, "Command1", "click", () => unloadForm("原料查詢")); } };
  FORMS["訂單顯示"] = {
    activate(inst) { setCap(ctl(inst, "Label7"), S.lastOrderText); on(inst, "Command1", "click", () => unloadForm("訂單顯示")); },
    load(inst) { setCap(ctl(inst, "Label7"), S.lastOrderText); on(inst, "Command1", "click", () => unloadForm("訂單顯示")); }
  };

  // ---------- 井字遊戲 (tic-tac-toe) ----------
  FORMS["Form1"] = {
    load(inst) { initTicTac(inst); },
  };
  FORMS["Form2"] = {};
  FORMS["Form3"] = {};
  function initTicTac(inst) {
    // 9 cells map to Label6..Label14
    const cells = []; for (let i = 0; i < 9; i++) cells.push(ctl(inst, "Label" + (6 + i)));
    const board = Array(9).fill(0); // 0 empty, 1 player(O), 2 cpu(X)
    let over = false, win = 0, lost = 0;
    cells.forEach((c, i) => {
      if (!c) return;
      c.style.cursor = "pointer"; c.style.justifyContent = "center"; c.style.alignItems = "center"; c.style.fontSize = "60px"; c.style.fontWeight = "bold";
      c.onclick = () => playerMove(i);
    });
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    function winner(p) { return lines.some(l => l.every(i => board[i] === p)); }
    function draw() { cells.forEach((c, i) => { if (c) { c.textContent = board[i] === 1 ? "○" : board[i] === 2 ? "╳" : ""; c.style.color = board[i] === 1 ? "#0000ff" : "#ff0000"; } }); }
    async function playerMove(i) {
      if (over || board[i] !== 0) return;
      board[i] = 1; draw();
      if (winner(1)) { over = true; win++; setLbl(); await MsgBox("You Win!!!", 0, "厲害唷~~~"); showForm("Form3"); return; }
      if (board.every(x => x)) { over = true; await MsgBox("平手", 0, "再接再厲"); reset(); return; }
      // cpu: block or win or random
      cpuMove();
    }
    function cpuMove() {
      let move = findLine(2) ?? findLine(1) ?? randomMove();
      if (move == null) { over = true; MsgBox("平手", 0, "再接再厲").then(reset); return; }
      board[move] = 2; draw();
      if (winner(2)) { over = true; lost++; setLbl(); MsgBox("你輸了~", 0, "你嫩了~~~").then(() => showForm("Form2")); }
    }
    function findLine(p) { // return cell that completes (or blocks) a line for player p
      for (const l of lines) { const vals = l.map(i => board[i]); if (vals.filter(v => v === p).length === 2 && vals.includes(0)) return l[vals.indexOf(0)]; } return null;
    }
    function randomMove() { const empty = board.map((v, i) => v === 0 ? i : -1).filter(i => i >= 0); return empty.length ? empty[Math.floor(Math.random() * empty.length)] : null; }
    function setLbl() { setCap(ctl(inst, "Label4"), win + "次"); setCap(ctl(inst, "Label5"), lost + "次"); }
    function reset() { for (let i = 0; i < 9; i++) board[i] = 0; over = false; draw(); }
    inst.state.reset = reset;
    on(inst, "Command4", "click", reset);
    on(inst, "Command1", "click", () => { showForm("第一個畫面"); });
    onMenu(inst, "xx", () => { showForm("顧客系統選擇"); hideForm("Form1"); });
    onMenu(inst, "dd", () => { showForm("管理者登入"); unloadForm("Form1"); });
    onMenu(inst, "hh", () => { showForm("廚師登入"); unloadForm("Form1"); });
    draw();
  }

  // ===== boot =====
  async function boot() {
    LAYOUT = await fetch("layout.json?v=2", { cache: "no-cache" }).then(r => r.json());
    for (const slug in LAYOUT.forms) { LAYOUT.forms[slug].slug = slug; bySlug[LAYOUT.forms[slug].vb_name] = slug; }
    // assign option-button groups per form so radios don't bleed across forms
    showForm("第一個畫面");
    // taskbar clock
    setInterval(() => { const el = document.querySelector("#taskbar .clock"); if (el) el.textContent = new Date().toLocaleTimeString(); }, 1000);
  }
  window.addEventListener("DOMContentLoaded", boot);
  window.VBApp = { showForm, unloadForm, S, get inventory() { return inventory; } };
})();
