/* NailFlow P2 interactive prototype */
(function () {
  "use strict";

  var $app = document.getElementById("app");
  var $bar = document.getElementById("demo-bar");
  var $tabs = document.getElementById("tabbar");
  var $modal = document.getElementById("modal-root");
  var $toast = document.getElementById("toast-root");
  var tickTimer = null;
  var book = null;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function go(hash) {
    if (hash.charAt(0) !== "#") hash = "#" + hash;
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  function parseHash() {
    var h = (location.hash || "#/customer/home").replace(/^#/, "");
    if (h.charAt(0) !== "/") h = "/" + h;
    var q = "";
    var qi = h.indexOf("?");
    if (qi >= 0) {
      q = h.slice(qi + 1);
      h = h.slice(0, qi);
    }
    var parts = h.split("/").filter(Boolean);
    var query = {};
    q.split("&").forEach(function (p) {
      if (!p) return;
      var kv = p.split("=");
      query[decodeURIComponent(kv[0])] = decodeURIComponent(kv.slice(1).join("=") || "");
    });
    return {
      role: parts[0] || "customer",
      page: parts[1] || defaultPage(parts[0] || "customer"),
      id: parts[2] || "",
      query: query,
      parts: parts
    };
  }

  function defaultPage(role) {
    if (role === "staff") return "today";
    if (role === "boss") return "dashboard";
    return "home";
  }

  function toast(msg, type) {
    var el = document.createElement("div");
    el.className = "toast" + (type === "err" ? " err" : type === "ok" ? " ok" : "");
    el.textContent = msg;
    $toast.appendChild(el);
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 3200);
  }

  function closeModal() {
    $modal.innerHTML = "";
  }

  function openModal(title, bodyHtml, footerHtml) {
    $modal.innerHTML =
      '<div class="modal-backdrop" data-action="close-modal">' +
      '<div class="modal" role="dialog" aria-modal="true">' +
      "<h3 class=\"serif\">" + esc(title) + "</h3>" +
      "<div class=\"mt-8\">" + bodyHtml + "</div>" +
      (footerHtml ? '<div class="split mt-16">' + footerHtml + "</div>" : "") +
      "</div></div>";
  }

  function confirmModal(title, text, onOk, okLabel) {
    window.__nfConfirm = function () {
      closeModal();
      onOk();
    };
    openModal(
      title,
      "<p class=\"muted\">" + esc(text) + "</p>",
      '<button class="btn btn-ghost grow" data-action="close-modal">取消</button>' +
        '<button class="btn grow" data-action="run-confirm">' + esc(okLabel || "确定") + "</button>"
    );
  }

  function fmtMs(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var m = Math.floor(s / 60);
    s = s % 60;
    return m + " 分 " + (s < 10 ? "0" : "") + s + " 秒";
  }

  function phoneMask(p) {
    p = String(p || "");
    if (p.length >= 7) return p.slice(0, 3) + "****" + p.slice(-4);
    return p;
  }

  function statusPill(st) {
    return '<span class="pill st-' + esc(st) + '">' + esc(NF.STATUS_LABEL[st] || st) + "</span>";
  }

  function artistById(id) {
    return NF.getStaff(id);
  }

  function defaultBook() {
    var c = NF.getCustomer(NF.getSession().customerId) || {};
    return {
      step: 1,
      serviceIds: [],
      staffId: "",
      date: NF.todayISO(),
      start: "",
      chairId: "",
      refIds: [],
      customRefDataUrls: [],
      note: "",
      name: c.name || "",
      phone: c.phone || ""
    };
  }

  function applyBookQuery(q) {
    if (!book) book = defaultBook();
    if (q.service) book.serviceIds = q.service.split(",").filter(Boolean);
    if (q.artist) book.staffId = q.artist;
    if (q.ref && book.refIds.indexOf(q.ref) < 0) book.refIds.push(q.ref);
    if (q.step) book.step = Number(q.step) || book.step;
    if (book.serviceIds.length && book.staffId) book.step = Math.max(book.step, 2);
  }

  /* ---------- chrome ---------- */
  function renderBar() {
    var ses = NF.getSession();
    var store = NF.getStore();
    var staffOpts = NF.getStaffList({ activeOnly: true })
      .map(function (s) {
        return "<option value=\"" + s.id + "\"" + (s.id === ses.staffId ? " selected" : "") + ">" + esc(s.name) + "</option>";
      })
      .join("");
    $bar.innerHTML =
      '<div class="demo-main">' +
      '<div class="demo-left">' +
      '<img class="demo-mark" src="assets/mark.svg" alt="" />' +
      '<div class="demo-brand"><strong>NailFlow</strong>' +
      '<span class="demo-flag">' + esc(NF.getSettings().demoLabel) + " · " + esc(store.name) + "</span></div></div>" +
      '<div class="demo-right">' +
      '<div class="role-switch" role="tablist" aria-label="切换角色">' +
      roleBtn("customer", "顾客", ses.role) +
      roleBtn("staff", "店员", ses.role) +
      roleBtn("boss", "老板", ses.role) +
      "</div>" +
      (ses.role === "staff"
        ? '<label class="staff-switch"><select data-action="switch-staff" aria-label="当前店员">' + staffOpts + "</select></label>"
        : "") +
      '<button class="btn-reset" data-action="reset">一键重置演示数据</button>' +
      "</div></div>" +
      '<div class="demo-pending-note">视觉与建议品牌名澄光待创始人确认，未锁定</div>';
  }

  function roleBtn(role, label, cur) {
    return (
      '<button type="button" aria-pressed="' +
      (cur === role) +
      '" data-action="switch-role" data-role="' +
      role +
      '">' +
      label +
      "</button>"
    );
  }

  var CUSTOMER_TABS = [
    ["home", "首页", "⌂"],
    ["works", "作品", "▦"],
    ["book", "预约", "◇"],
    ["member", "会员", "◎"],
    ["me", "我的", "○"]
  ];
  var STAFF_TABS = [
    ["today", "今日", "▣"],
    ["customers", "顾客", "☺"],
    ["chairs", "椅位", "▤"],
    ["me", "我的", "○"]
  ];
  var BOSS_TABS = [
    ["dashboard", "看板", "▣"],
    ["appointments", "预约", "◇"],
    ["ops", "经营", "▦"],
    ["settings", "设置", "⚙"]
  ];
  var BOSS_SIDE = [
    ["dashboard", "经营看板"],
    ["appointments", "预约总览"],
    ["services", "服务项目"],
    ["staff", "员工与排班"],
    ["chairs", "工位椅位"],
    ["works", "作品管理"],
    ["members", "会员与次卡"],
    ["customers", "顾客档案"],
    ["referrals", "推荐来源"],
    ["settings", "门店设置"]
  ];
  var STAFF_SIDE = [
    ["today", "今日档期"],
    ["customers", "顾客与核销"],
    ["chairs", "椅位状态"],
    ["me", "我的排班"]
  ];

  function renderTabs(route) {
    var role = NF.getSession().role;
    var tabs = role === "staff" ? STAFF_TABS : role === "boss" ? BOSS_TABS : CUSTOMER_TABS;
    var page = route.page;
    var mapped = page;
    if (role === "customer" && (page === "appointments" || page === "services" || page === "artists")) mapped = page === "appointments" ? "me" : page === "artists" ? "home" : "book";
    if (role === "staff" && page === "appointments") mapped = "today";
    if (role === "boss" && ["services", "staff", "chairs", "works", "members", "customers", "referrals"].indexOf(page) >= 0) mapped = "ops";
    $tabs.hidden = false;
    $tabs.innerHTML = tabs
      .map(function (t) {
        return (
          '<a href="#/' +
          role +
          "/" +
          t[0] +
          '" class="' +
          (mapped === t[0] ? "active" : "") +
          '"><span>' +
          t[2] +
          "</span>" +
          t[1] +
          "</a>"
        );
      })
      .join("");
  }

  function customerTopNav(page) {
    var links = [
      ["home", "首页"],
      ["works", "作品"],
      ["services", "项目"],
      ["artists", "技师"],
      ["book", "预约"],
      ["appointments", "我的预约"],
      ["member", "会员次卡"],
      ["me", "我的"]
    ];
    return (
      '<nav class="customer-desktop-nav">' +
      '<div class="serif" style="font-size:18px">澄光美甲美睫·演示店</div>' +
      '<div class="links">' +
      links
        .map(function (l) {
          var on = page === l[0] || (page === "book" && l[0] === "book");
          return '<a href="#/customer/' + l[0] + '" class="' + (on ? "active" : "") + '">' + l[1] + "</a>";
        })
        .join("") +
      "</div></nav>"
    );
  }

  function adminShell(route, inner) {
    var role = NF.getSession().role;
    var items = role === "boss" ? BOSS_SIDE : STAFF_SIDE;
    var side = items
      .map(function (it) {
        return (
          '<a href="#/' +
          role +
          "/" +
          it[0] +
          '" class="' +
          (route.page === it[0] ? "active" : "") +
          '">' +
          it[1] +
          "</a>"
        );
      })
      .join("");
    return (
      '<div class="admin-shell"><aside class="sidebar"><div class="side-title">' +
      (role === "boss" ? "老板端" : "店员端") +
      '</div><nav class="side-nav">' +
      side +
      "</nav></aside><main class=\"admin-main\">" +
      inner +
      "</main></div>"
    );
  }

  /* ---------- customer views ---------- */
  function viewHome() {
    var store = NF.getStore();
    var featured = NF.getWorks({ published: true, featured: true });
    var services = NF.getServices({ activeOnly: true }).slice(0, 5);
    var staff = NF.getStaffList({ activeOnly: true });
    var upcoming = NF.getAppointments({ customerId: NF.getSession().customerId }).filter(function (a) {
      return ["pending_confirm", "confirmed", "arrived", "in_service"].indexOf(a.status) >= 0;
    })[0];
    return (
      customerTopNav("home") +
      '<div class="page">' +
      '<section class="hero">' +
      '<div class="hero-copy"><div class="eyebrow">NailFlow 演示</div>' +
      "<h1>" +
      esc(store.slogan) +
      "</h1>" +
      '<p class="lead">' +
      esc(store.intro) +
      "</p>" +
      '<div class="split mt-16">' +
      '<a class="btn" href="#/customer/book">预约时段</a>' +
      '<a class="btn btn-ghost" href="#/customer/works">浏览作品</a>' +
      "</div>" +
      '<p class="note-bar">' +
      esc(store.hoursText) +
      " · " +
      esc(store.address) +
      "</p></div>" +
      '<div class="hero-illu"><img src="assets/hero.svg" alt="柔和的美甲抽象插画" /></div>' +
      "</section>" +
      '<div class="announce mt-16"><b>公告</b><div>' +
      esc(store.announcement) +
      "</div></div>" +
      (upcoming
        ? '<div class="card card-pad mt-16"><div class="eyebrow">即将到来</div><div class="toolbar mb-0"><div><strong>' +
          esc(NF.serviceNamesOf(upcoming)) +
          "</strong><div class=\"faint\">" +
          esc(NF.formatDateCN(upcoming.date) + " " + upcoming.start + "–" + NF.endTimeOf(upcoming)) +
          " · " +
          esc((artistById(upcoming.staffId) || {}).name || "") +
          "</div></div>" +
          statusPill(upcoming.status) +
          '</div><a class="btn btn-sm btn-ghost mt-8" href="#/customer/appointments/' +
          upcoming.id +
          '">查看详情</a></div>'
        : "") +
      '<section class="section"><div class="section-head"><h2>作品精选</h2><a href="#/customer/works">全部作品</a></div>' +
      '<div class="works-grid featured">' +
      featured
        .map(function (w) {
          return workCard(w);
        })
        .join("") +
      "</div></section>" +
      '<section class="section"><div class="section-head"><h2>服务项目</h2><a href="#/customer/services">查看全部</a></div>' +
      '<div class="list-stack">' +
      services.map(serviceCard).join("") +
      "</div></section>" +
      '<section class="section"><div class="section-head"><h2>技师</h2><a href="#/customer/artists">全部技师</a></div>' +
      '<div class="h-scroll">' +
      staff.map(artistCard).join("") +
      "</div></section></div>"
    );
  }

  function workCard(w) {
    var a = artistById(w.artistId);
    return (
      '<a class="work-card" href="#/customer/works/' +
      w.id +
      '"><div class="thumb"><img src="' +
      esc(w.image) +
      '" alt="' +
      esc(w.title) +
      '" /></div><div class="meta"><strong>' +
      esc(w.title) +
      '</strong><span class="faint">' +
      esc(w.category) +
      (a ? " · " + esc(a.name) : "") +
      "</span></div></a>"
    );
  }

  function serviceCard(s) {
    return (
      '<a class="service-card" href="#/customer/book?service=' +
      s.id +
      '"><div><strong>' +
      esc(s.name) +
      '</strong><div class="faint">' +
      esc(s.category) +
      " · " +
      s.durationMinutes +
      " 分钟</div></div><div class=\"price\">" +
      NF.formatMoney(s.price) +
      "</div></a>"
    );
  }

  function artistCard(s) {
    return (
      '<a class="artist-chip card" href="#/customer/artists/' +
      s.id +
      '"><img src="' +
      esc(s.avatar) +
      '" alt="" /><div class="mt-8"><strong>' +
      esc(s.name) +
      '</strong><div class="faint">' +
      esc(s.title) +
      "</div></div></a>"
    );
  }

  function viewWorks(route) {
    if (route.id) return viewWorkDetail(route.id);
    var cat = route.query.cat || "全部";
    var list = NF.getWorks({ published: true, category: cat });
    var cats = ["全部", "美甲", "美睫"];
    return (
      customerTopNav("works") +
      '<div class="page"><div class="eyebrow">Gallery</div><h1>作品画廊</h1>' +
      '<p class="lead">以下均为本样品自制的抽象插画，用来演示门店作品展示，不是真实客片。</p>' +
      '<div class="chips mt-16">' +
      cats
        .map(function (c) {
          return (
            '<a class="chip' +
            (cat === c ? " active" : "") +
            '" href="#/customer/works?cat=' +
            encodeURIComponent(c) +
            '">' +
            c +
            "</a>"
          );
        })
        .join("") +
      '</div><div class="works-grid gallery mt-16">' +
      list.map(workCard).join("") +
      "</div></div>"
    );
  }

  function viewWorkDetail(id) {
    var w = NF.getWork(id);
    if (!w) return notFound("找不到这件作品。");
    var a = artistById(w.artistId);
    var more = NF.getWorks({ published: true, category: w.category }).filter(function (x) { return x.id !== w.id; }).slice(0, 4);
    var svcHint = w.category === "美睫" ? "svc_lash_natural" : "svc_design";
    return (
      customerTopNav("works") +
      '<div class="page"><div class="detail-hero two">' +
      '<div class="work-detail-img"><img src="' +
      esc(w.image) +
      '" alt="' +
      esc(w.title) +
      '" /></div>' +
      "<div><div class=\"eyebrow\">" +
      esc(w.category) +
      "</div><h1>" +
      esc(w.title) +
      "</h1><p class=\"lead\">" +
      esc(w.desc) +
      "</p>" +
      (a
        ? '<a class="cust-row mt-16" href="#/customer/artists/' +
          a.id +
          '"><div style="display:flex;gap:12px;align-items:center"><img class="avatar sm" src="' +
          esc(a.avatar) +
          '" alt="" /><div><strong>' +
          esc(a.name) +
          '</strong><div class="faint">' +
          esc(a.title) +
          "</div></div></div><span class=\"faint\">技师主页</span></a>"
        : "") +
      '<div class="split mt-24">' +
      '<a class="btn" href="#/customer/book?service=' +
      svcHint +
      (a ? "&artist=" + a.id : "") +
      '">预约同款风格</a>' +
      '<a class="btn btn-ghost" href="#/customer/works">返回画廊</a>' +
      "</div>" +
      '<p class="help mt-8">「预约同款风格」会带你去预约页，并可附上款式参考图。这不是完整款式 SKU 图库。</p>' +
      "</div></div>" +
      (more.length
        ? '<section class="section"><h2>相近作品</h2><div class="works-grid mt-16">' + more.map(workCard).join("") + "</div></section>"
        : "") +
      "</div>"
    );
  }

  function viewServices() {
    var list = NF.getServices({ activeOnly: true });
    var groups = {};
    list.forEach(function (s) {
      (groups[s.category] = groups[s.category] || []).push(s);
    });
    var html = Object.keys(groups)
      .map(function (g) {
        return "<h2 class=\"mt-24\">" + esc(g) + "</h2><div class=\"list-stack mt-8\">" + groups[g].map(serviceCard).join("") + "</div>";
      })
      .join("");
    return (
      customerTopNav("services") +
      '<div class="page"><div class="eyebrow">Menu</div><h1>服务项目</h1>' +
      '<p class="lead">价格与时长在预约提交前都会再展示一遍。同一张预约可选多个项目，但须由同一位技师完成。</p>' +
      html +
      "</div>"
    );
  }

  function viewArtists(route) {
    if (route.id) return viewArtistDetail(route.id);
    var list = NF.getStaffList({ activeOnly: true });
    return (
      customerTopNav("artists") +
      '<div class="page"><div class="eyebrow">Artists</div><h1>技师与档期</h1>' +
      '<div class="list-stack mt-16">' +
      list
        .map(function (s) {
          var todaySlots = NF.getAvailableStarts({
            staffId: s.id,
            chairId: NF.getChairs({ activeOnly: true })[0].id,
            date: NF.todayISO(),
            duration: 90
          }).length;
          return (
            '<a class="cust-row" href="#/customer/artists/' +
            s.id +
            '"><div style="display:flex;gap:12px;align-items:center"><img class="avatar" src="' +
            esc(s.avatar) +
            '" alt="" /><div><strong>' +
            esc(s.name) +
            '</strong><div class="faint">' +
            esc(s.title) +
            " · 今日约 90 分钟项目可约 " +
            todaySlots +
            " 个开始时间（以实际项目和椅位为准）</div></div></div><span class=\"faint\">查看</span></a>"
          );
        })
        .join("") +
      "</div></div>"
    );
  }

  function viewArtistDetail(id) {
    var s = NF.getStaff(id);
    if (!s) return notFound("找不到这位技师。");
    var works = NF.getWorks({ published: true, artistId: s.id });
    var skills = s.skills.map(function (id) { var x = NF.getService(id); return x && x.active ? esc(x.name) : ""; }).filter(Boolean);
    var days = [];
    for (var i = 0; i < 7; i++) {
      var d = NF.addDays(NF.todayISO(), i);
      var iv = NF.workingIntervals(s, d);
      days.push(
        '<div class="card card-pad" style="min-width:120px"><div class="faint">' +
          esc(NF.formatDateCN(d)) +
          "</div><strong>" +
          (iv.length ? iv.map(function (x) { return NF.toHHMM(x.start) + "–" + NF.toHHMM(x.end); }).join("<br>") : "休息") +
          "</strong></div>"
      );
    }
    return (
      customerTopNav("artists") +
      '<div class="page"><div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">' +
      '<img class="avatar lg" src="' +
      esc(s.avatar) +
      '" alt="" /><div><div class="eyebrow">' +
      esc(s.title) +
      "</div><h1>" +
      esc(s.name) +
      '</h1><p class="lead mb-0">' +
      esc(s.bio) +
      "</p></div></div>" +
      '<div class="chips mt-16">' +
      skills.map(function (n) { return '<span class="chip">' + n + "</span>"; }).join("") +
      "</div>" +
      '<div class="split mt-16"><a class="btn" href="#/customer/book?artist=' +
      s.id +
      '">预约这位技师</a></div>' +
      '<section class="section"><h2>近七日排班</h2><div class="h-scroll mt-8">' +
      days.join("") +
      "</div></section>" +
      (works.length
        ? '<section class="section"><h2>Ta 的作品</h2><div class="works-grid mt-16">' + works.map(workCard).join("") + "</div></section>"
        : "") +
      "</div>"
    );
  }


  function viewBook() {
    if (!book) book = defaultBook();
    var step = book.step || 1;
    var services = NF.getServices({ activeOnly: true });
    var selected = services.filter(function (s) { return book.serviceIds.indexOf(s.id) >= 0; });
    var duration = NF.sumDurations(selected);
    var price = NF.sumPrice(selected);
    var buffer = NF.getSettings().bufferMinutes;
    var eligible = selected.length ? NF.getEligibleStaff(book.serviceIds) : [];
    var steps = ["选项目", "选技师", "选时段椅位", "参考图与提交"];
    var stepNav =
      '<div class="steps">' +
      steps
        .map(function (name, i) {
          return '<div class="step' + (step === i + 1 ? " on" : "") + '">' + (i + 1) + ". " + name + "</div>";
        })
        .join("") +
      "</div>";
    var summary =
      '<aside class="card card-pad summary-card"><h3>预约摘要</h3>' +
      (selected.length
        ? "<ul>" +
          selected.map(function (s) { return "<li>" + esc(s.name) + " · " + s.durationMinutes + " 分钟 · " + NF.formatMoney(s.price) + "</li>"; }).join("") +
          "</ul>"
        : '<p class="faint">还没有选择项目</p>') +
      '<div class="kv mt-8">' +
      "<dt>总时长</dt><dd>" +
      (duration ? duration + " 分钟" : "—") +
      "</dd><dt>缓冲</dt><dd>" +
      buffer +
      " 分钟（建议默认值，待确认）</dd><dt>占用至</dt><dd>" +
      (book.start && duration ? NF.toHHMM(NF.toMin(book.start) + duration + buffer) : "—") +
      "</dd><dt>合计</dt><dd class=\"price-lg\" style=\"font-size:22px\">" +
      (price ? NF.formatMoney(price) : "—") +
      "</dd><dt>技师</dt><dd>" +
      esc((NF.getStaff(book.staffId) || {}).name || "未选") +
      "</dd><dt>椅位</dt><dd>" +
      esc((NF.getChair(book.chairId) || {}).name || "未选") +
      "</dd><dt>时间</dt><dd>" +
      (book.date && book.start ? esc(NF.formatDateCN(book.date) + " " + book.start) : "未选") +
      "</dd></div>" +
      '<p class="help mt-8">先约后付：提交预约无需付款，服务完成后再到店结算。同一张单须由同一位技师完成。</p></aside>';

    var body = "";
    if (step === 1) {
      body =
        '<p class="muted">可多选。请注意：所选项目必须能由同一位技师完成。完整款式 SKU 图库首版缓停，款式沟通请在第 4 步附参考图。</p>' +
        '<div class="list-stack mt-16">' +
        services
          .map(function (s) {
            var on = book.serviceIds.indexOf(s.id) >= 0;
            return (
              '<label class="check-item' +
              (on ? " selected" : "") +
              '"><input type="checkbox" data-action="book-toggle-service" data-id="' +
              s.id +
              '"' +
              (on ? " checked" : "") +
              " /><div class=\"grow\"><strong>" +
              esc(s.name) +
              '</strong><div class="faint">' +
              esc(s.category) +
              " · " +
              s.durationMinutes +
              " 分钟 · " +
              NF.formatMoney(s.price) +
              "</div><div class=\"help\">" +
              esc(s.desc) +
              "</div></div></label>"
            );
          })
          .join("") +
        "</div>" +
        '<div class="split mt-16"><button class="btn" data-action="book-next" ' +
        (selected.length ? "" : "disabled") +
        ">下一步：选技师</button></div>";
    } else if (step === 2) {
      body =
        (eligible.length
          ? '<p class="muted">只显示会做所选全部项目、且当前在职的技师。</p><div class="list-stack mt-16">' +
            eligible
              .map(function (s) {
                var on = book.staffId === s.id;
                return (
                  '<label class="check-item' +
                  (on ? " selected" : "") +
                  '"><input type="radio" name="artist" data-action="book-staff" data-id="' +
                  s.id +
                  '"' +
                  (on ? " checked" : "") +
                  " /><img class=\"avatar sm\" src=\"" +
                  esc(s.avatar) +
                  '" alt="" /><div><strong>' +
                  esc(s.name) +
                  '</strong><div class="faint">' +
                  esc(s.title) +
                  " · " +
                  esc(s.bio) +
                  "</div></div></label>"
                );
              })
              .join("") +
            "</div>"
          : '<div class="error-box">没有技师同时会做这些项目。请回到上一步减少项目，或拆成两次预约。</div>') +
        '<div class="split mt-16"><button class="btn btn-ghost" data-action="book-prev">上一步</button>' +
        '<button class="btn" data-action="book-next"' +
        (book.staffId ? "" : " disabled") +
        ">下一步：选时段</button></div>";
    } else if (step === 3) {
      var days = "";
      for (var i = 0; i < 14; i++) {
        var d = NF.addDays(NF.todayISO(), i);
        days +=
          '<button type="button" class="day' +
          (book.date === d ? " selected" : "") +
          '" data-action="book-date" data-date="' +
          d +
          '">' +
          esc(NF.formatDateCN(d).replace(" ", "<br>").replace("月", "月<br>")).replace(/&lt;br&gt;/g, "<br>") +
          "</button>";
      }
      // fix date buttons - don't esc the br. Let me redo simply.
      days = "";
      for (i = 0; i < 14; i++) {
        d = NF.addDays(NF.todayISO(), i);
        var p = d.split("-");
        var wd = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][NF.weekday(d)];
        days +=
          '<button type="button" class="day' +
          (book.date === d ? " selected" : "") +
          '" data-action="book-date" data-date="' +
          d +
          '"><div class="faint">' +
          wd +
          "</div><strong>" +
          Number(p[1]) +
          "/" +
          Number(p[2]) +
          "</strong></button>";
      }
      var chairs = NF.getChairs({ activeOnly: true });
      var chairSel =
        '<div class="chips mt-8">' +
        chairs
          .map(function (c) {
            return (
              '<button type="button" class="chip' +
              (book.chairId === c.id ? " active" : "") +
              '" data-action="book-chair" data-id="' +
              c.id +
              '">' +
              esc(c.name) +
              (c.note ? " · " + esc(c.note) : "") +
              "</button>"
            );
          })
          .join("") +
        "</div>";
      var slotsHtml = '<p class="help">请先选择椅位，系统会按技师排班、已占用区间和缓冲计算可约开始时间。</p>';
      if (book.chairId && book.staffId && book.date && duration) {
        var starts = NF.getAvailableStarts({
          staffId: book.staffId,
          chairId: book.chairId,
          date: book.date,
          duration: duration,
          bufferMinutes: buffer
        });
        slotsHtml = starts.length
          ? '<div class="slot-grid mt-8">' +
            starts
              .map(function (t) {
                var hh = NF.toHHMM(t);
                return (
                  '<button type="button" class="slot' +
                  (book.start === hh ? " selected" : "") +
                  '" data-action="book-start" data-start="' +
                  hh +
                  '">' +
                  hh +
                  "</button>"
                );
              })
              .join("") +
            "</div>"
          : '<div class="error-box">这一天在该椅位上已没有能放下全程（含缓冲）的开始时间。请换一天、换椅位，或减少项目。</div>';
      }
      body =
        "<h3>选择日期</h3><div class=\"day-row mt-8\">" +
        days +
        "</div><h3 class=\"mt-16\">选择椅位</h3>" +
        chairSel +
        "<h3 class=\"mt-16\">可约开始时间</h3>" +
        slotsHtml +
        '<div class="split mt-16"><button class="btn btn-ghost" data-action="book-prev">上一步</button>' +
        '<button class="btn" data-action="book-next"' +
        (book.start && book.chairId ? "" : " disabled") +
        ">下一步：附图提交</button></div>";
    } else {
      var refs = NF.getRefs();
      var refHtml =
        '<div class="ref-grid mt-8">' +
        refs
          .map(function (r) {
            var on = book.refIds.indexOf(r.id) >= 0;
            return (
              '<button type="button" class="ref-pick' +
              (on ? " selected" : "") +
              '" data-action="book-ref" data-id="' +
              r.id +
              '" title="' +
              esc(r.title) +
              '"><img src="' +
              esc(r.image) +
              '" alt="' +
              esc(r.title) +
              '" /></button>'
            );
          })
          .join("") +
        "</div>";
      var custom = (book.customRefDataUrls || [])
        .map(function (u, idx) {
          return '<img src="' + esc(u) + '" alt="本地参考图" style="width:72px;height:72px;object-fit:cover;border-radius:8px" /><button class="btn btn-sm btn-ghost" data-action="book-remove-custom" data-idx="' + idx + '">移除</button>';
        })
        .join("");
      body =
        '<p class="muted">可从门店款式参考图里挑选，或从本地选择图片预览（只存在于本机演示数据，不会上传到服务器）。这不是完整 SKU 图库。</p>' +
        refHtml +
        '<div class="field mt-16"><label>从本地添加参考图（可选，最多 2 张）</label>' +
        '<input type="file" accept="image/*" data-action="book-upload" ' +
        ((book.customRefDataUrls || []).length >= 2 ? "disabled" : "") +
        " />" +
        '<div class="split mt-8">' +
        custom +
        "</div></div>" +
        '<div class="field"><label>备注</label><textarea data-bind="book.note" placeholder="例如：微笑线细一点、对某种材料过敏等">' +
        esc(book.note) +
        "</textarea></div>" +
        '<div class="field"><label>预约姓名</label><input data-bind="book.name" value="' +
        esc(book.name) +
        '" /></div>' +
        '<div class="field"><label>联系电话</label><input data-bind="book.phone" value="' +
        esc(book.phone) +
        '" /></div>' +
        '<p class="help">提交后' +
        (NF.getSettings().confirmMode === "auto" ? "将自动确认，并锁定技师与椅位。" : "进入待确认，店员确认前会锁定档期；超时未确认将自动释放。") +
        " 无需预先付款。</p>" +
        '<div class="split mt-16"><button class="btn btn-ghost" data-action="book-prev">上一步</button>' +
        '<button class="btn" data-action="book-submit">提交预约</button></div>';
    }

    return (
      customerTopNav("book") +
      '<div class="page"><div class="eyebrow">Booking</div><h1>预约</h1>' +
      stepNav +
      '<div class="book-layout">' +
      "<div>" +
      body +
      "</div>" +
      summary +
      "</div></div>"
    );
  }

  function viewAppointments(route) {
    if (route.id) return viewApptDetail(route.id, "customer");
    var list = NF.getAppointments({ customerId: NF.getSession().customerId }).slice().reverse();
    var filter = route.query.st || "all";
    var groups = {
      all: list,
      open: list.filter(function (a) { return ["pending_confirm", "confirmed", "arrived", "in_service", "pending_settle"].indexOf(a.status) >= 0; }),
      done: list.filter(function (a) { return a.status === "completed"; })
    };
    var show = groups[filter] || list;
    return (
      customerTopNav("appointments") +
      '<div class="page"><div class="toolbar"><div><div class="eyebrow">My bookings</div><h1>我的预约</h1></div>' +
      '<a class="btn btn-sm" href="#/customer/book">新预约</a></div>' +
      '<div class="chips">' +
      [["all", "全部"], ["open", "进行中"], ["done", "已完成"]]
        .map(function (x) {
          return '<a class="chip' + (filter === x[0] ? " active" : "") + '" href="#/customer/appointments?st=' + x[0] + '">' + x[1] + "</a>";
        })
        .join("") +
      '</div><div class="list-stack mt-16">' +
      (show.length ? show.map(function (a) { return apptRow(a, "customer"); }).join("") : '<div class="empty">还没有预约。</div>') +
      "</div></div>"
    );
  }

  function apptRow(a, role) {
    var staff = NF.getStaff(a.staffId) || {};
    var href = "#/" + role + "/appointments/" + a.id;
    var cd =
      a.status === "pending_confirm"
        ? '<div class="faint">确认倒计时 ' + fmtMs(NF.remainingConfirmMs(a)) + "</div>"
        : "";
    return (
      '<a class="appt-row" href="' +
      href +
      '"><div><strong>' +
      esc(NF.serviceNamesOf(a)) +
      "</strong><div class=\"faint\">" +
      esc(NF.formatDateCN(a.date) + " " + a.start + "–" + NF.endTimeOf(a)) +
      " · " +
      esc(staff.name || "") +
      (role !== "customer" ? " · " + esc(a.customerName) : "") +
      "</div>" +
      cd +
      "</div>" +
      statusPill(a.status) +
      "</a>"
    );
  }

  function viewApptDetail(id, role) {
    var a = NF.getAppointment(id);
    if (!a) return notFound("找不到这张预约。");
    if (role === "customer" && a.customerId !== NF.getSession().customerId) {
      return notFound("只能查看自己的预约。");
    }
    var staff = NF.getStaff(a.staffId) || {};
    var chair = NF.getChair(a.chairId) || {};
    var svcs = NF.resolveServices(a.serviceIds);
    var refs = (a.refIds || []).map(function (rid) { return NF.getRef(rid); }).filter(Boolean);
    var cd =
      a.status === "pending_confirm"
        ? '<div class="ok-box">待确认，剩余 ' + fmtMs(NF.remainingConfirmMs(a)) + "。超时将自动释放技师与椅位。</div>"
        : "";
    var actions = apptActions(a, role);
    var wrapStart = role === "customer" ? customerTopNav("appointments") + '<div class="page">' : "";
    var wrapEnd = role === "customer" ? "</div>" : "";
    var hist = (a.history || [])
      .slice()
      .reverse()
      .map(function (h) {
        return "<li><strong>" + esc(h.text) + "</strong><div class=\"faint\">" + esc(h.by) + "</div></li>";
      })
      .join("");
    var refBlock =
      refs.length || (a.customRefDataUrls || []).length
        ? '<h3 class="mt-24">款式参考图</h3><div class="ref-grid mt-8">' +
          refs
            .map(function (r) {
              return '<div class="ref-pick"><img src="' + esc(r.image) + '" alt="' + esc(r.title) + '" /></div>';
            })
            .join("") +
          (a.customRefDataUrls || [])
            .map(function (u) {
              return '<div class="ref-pick"><img src="' + esc(u) + '" alt="顾客上传的参考图" /></div>';
            })
            .join("") +
          "</div>"
        : '<p class="help mt-16">这张预约没有附参考图。</p>';
    var inner =
      wrapStart +
      '<a class="faint" href="#/' +
      role +
      (role === "customer" ? "/appointments" : role === "staff" ? "/today" : "/appointments") +
      '">← 返回</a>' +
      '<div class="toolbar"><div class="eyebrow">Appointment</div>' +
      statusPill(a.status) +
      "</div><h1>" +
      esc(NF.serviceNamesOf(a)) +
      "</h1>" +
      cd +
      '<div class="card card-pad mt-16"><div class="kv">' +
      "<dt>顾客</dt><dd>" +
      esc(a.customerName) +
      " · " +
      esc(phoneMask(a.customerPhone)) +
      "</dd><dt>技师</dt><dd>" +
      esc(staff.name) +
      "</dd><dt>椅位</dt><dd>" +
      esc(chair.name) +
      "</dd><dt>日期</dt><dd>" +
      esc(NF.formatDateCN(a.date)) +
      "</dd><dt>服务时间</dt><dd>" +
      esc(a.start + "–" + NF.endTimeOf(a)) +
      "（" +
      a.durationMinutes +
      " 分钟）</dd><dt>占用至</dt><dd>" +
      esc(NF.lockEndOf(a)) +
      "（含 " +
      a.bufferMinutes +
      " 分钟缓冲）</dd><dt>金额</dt><dd>" +
      NF.formatMoney(a.price) +
      "</dd><dt>结算</dt><dd>先约后付" +
      (a.settleMethod ? " · 已结算" : "") +
      "</dd></div>" +
      (a.note ? '<p class="mt-16"><strong>备注</strong><br>' + esc(a.note) + "</p>" : "") +
      "</div>" +
      '<div class="list-stack mt-16">' +
      svcs
        .map(function (s) {
          return '<div class="service-card"><div><strong>' + esc(s.name) + '</strong><div class="faint">' + s.durationMinutes + " 分钟</div></div><div>" + NF.formatMoney(s.price) + "</div></div>";
        })
        .join("") +
      "</div>" +
      refBlock +
      (actions ? '<div class="row-actions mt-24">' + actions + "</div>" : "") +
      '<h3 class="mt-24">流转记录</h3><ul class="timeline-list">' +
      hist +
      "</ul>" +
      wrapEnd;
    if (role === "customer") return inner;
    return adminShell({ page: role === "staff" ? "today" : "appointments" }, inner);
  }

  function apptActions(a, role) {
    if (role === "customer") {
      if (a.status === "pending_confirm" || a.status === "confirmed") {
        return '<button class="btn btn-danger" data-action="cancel-appt" data-id="' + a.id + '" data-by="顾客">取消预约</button>';
      }
      return "";
    }
    var btns = [];
    if (a.status === "pending_confirm") {
      btns.push('<button class="btn" data-action="confirm-appt" data-id="' + a.id + '">确认预约</button>');
      btns.push('<button class="btn btn-danger" data-action="cancel-appt" data-id="' + a.id + '" data-by="店员">取消</button>');
    }
    if (a.status === "confirmed") {
      btns.push('<button class="btn" data-action="arrive-appt" data-id="' + a.id + '">到店</button>');
      btns.push('<button class="btn btn-gold" data-action="start-appt" data-id="' + a.id + '">开始服务</button>');
      btns.push('<button class="btn btn-danger" data-action="cancel-appt" data-id="' + a.id + '" data-by="店员">取消</button>');
    }
    if (a.status === "arrived") {
      btns.push('<button class="btn" data-action="start-appt" data-id="' + a.id + '">开始服务</button>');
    }
    if (a.status === "in_service") {
      btns.push('<button class="btn" data-action="complete-appt" data-id="' + a.id + '">服务完成</button>');
    }
    if (a.status === "pending_settle") {
      btns.push('<button class="btn" data-action="settle-open" data-id="' + a.id + '">结算核销</button>');
      btns.push('<button class="btn btn-danger" data-action="void-appt" data-id="' + a.id + '">作废待结算</button>');
    }
    return btns.join("");
  }

  function viewMember() {
    var c = NF.getCustomer(NF.getSession().customerId);
    var cards = NF.getCards({ customerId: c.id });
    var products = NF.getCardProducts({ activeOnly: true });
    var cons = NF.getConsumptions({ customerId: c.id });
    return (
      customerTopNav("member") +
      '<div class="page"><div class="eyebrow">Membership</div><h1>会员与次卡</h1>' +
      '<div class="card card-pad"><strong>' +
      (c.isMember ? "您是本店会员" : "您还不是会员") +
      '</strong><p class="muted mb-0">首版会员是标记与权益说明，没有复杂等级。演示权益：预约优先提示、可购买次卡。次卡是可核销的服务次数凭证，不是储值钱包，本样品不发生真实付款。</p></div>' +
      "<h2 class=\"mt-24\">我的次卡</h2>" +
      '<div class="list-stack mt-8">' +
      (cards.length
        ? cards
            .map(function (card) {
              var led = NF.getLedger({ cardId: card.id });
              return (
                '<div class="card card-pad"><div class="toolbar mb-0"><div><strong>' +
                esc(card.name) +
                '</strong><div class="faint">余 ' +
                card.remaining +
                " / " +
                card.total +
                " 次 · " +
                (card.status === "active" ? "有效" : "已用尽") +
                "</div></div><div class=\"price-lg\">" +
                card.remaining +
                "</div></div>" +
                '<div class="help mt-8">适用：' +
                esc(card.applicableServiceIds.map(function (id) { var s = NF.getService(id); return s ? s.name : id; }).join("、")) +
                "</div>" +
                "<details class=\"mt-8\"><summary>核销流水</summary><ul class=\"timeline-list mt-8\">" +
                led
                  .map(function (l) {
                    return "<li>" + esc(l.text) + '<div class="faint">' + esc(String(l.at).slice(0, 16)) + "</div></li>";
                  })
                  .join("") +
                "</ul></details></div>"
              );
            })
            .join("")
        : '<div class="empty">还没有次卡。可在下方走演示开卡流程。</div>') +
      "</div>" +
      "<h2 class=\"mt-24\">演示开卡</h2><p class=\"help\">以下是演示购卡，不会产生真实扣款。</p><div class=\"list-stack\">" +
      products
        .map(function (p) {
          return (
            '<div class="service-card"><div><strong>' +
            esc(p.name) +
            '</strong><div class="faint">' +
            p.times +
            " 次 · " +
            esc(p.desc) +
            '</div></div><div><div class="price">' +
            NF.formatMoney(p.price) +
            '</div><button class="btn btn-sm mt-8" data-action="buy-card" data-id="' +
            p.id +
            '">演示开卡</button></div></div>'
          );
        })
        .join("") +
      "</div>" +
      "<h2 class=\"mt-24\">消费记录</h2><div class=\"list-stack\">" +
      (cons.length
        ? cons
            .map(function (x) {
              return (
                '<div class="list-card card-pad"><strong>' +
                esc(x.serviceNames) +
                '</strong><div class="faint">' +
                esc(x.date) +
                " · " +
                esc(x.methodLabel) +
                " · " +
                NF.formatMoney(x.amount) +
                "</div></div>"
              );
            })
            .join("")
        : '<div class="empty">暂无消费记录。</div>') +
      "</div></div>"
    );
  }

  function viewMe() {
    var c = NF.getCustomer(NF.getSession().customerId);
    var store = NF.getStore();
    var link = "https://demo.nailflow.local/s/chengguang?ref=" + c.id;
    return (
      customerTopNav("me") +
      '<div class="page"><div class="eyebrow">Me</div><h1>我的</h1>' +
      '<div class="card card-pad"><strong>' +
      esc(c.name) +
      "</strong> " +
      (c.isMember ? '<span class="pill st-completed">会员</span>' : "") +
      '<div class="faint">' +
      esc(phoneMask(c.phone)) +
      " · 来源：" +
      esc(c.source || "未填写") +
      "</div>" +
      '<p class="help">这是当前演示身份。电话为虚构号码。</p></div>' +
      '<div class="list-stack mt-16">' +
      '<a class="appt-row" href="#/customer/appointments"><div><strong>我的预约</strong><div class="faint">查看状态与取消规则</div></div><span class="faint">进入</span></a>' +
      '<a class="appt-row" href="#/customer/member"><div><strong>会员与次卡</strong><div class="faint">余次、流水与演示开卡</div></div><span class="faint">进入</span></a>' +
      "</div>" +
      '<div class="card card-pad mt-24"><h3>分享门店</h3><p class="muted">下面是模拟分享链接，不会打开真实网页，也不代表已上线。</p>' +
      '<div class="soft-panel">' +
      esc(link) +
      '</div><button class="btn btn-sm mt-8" data-action="copy-share" data-text="' +
      esc(link) +
      '">复制模拟链接</button>' +
      '<button class="btn btn-sm btn-ghost mt-8" data-action="sim-referral">模拟一位新客经我分享到店</button>' +
      '<p class="help">推荐来源首次唯一，不能推荐自己；要到首次真实到店消费并生成记录后，才算有效转化。</p></div>' +
      '<div class="card card-pad mt-16"><h3>门店信息</h3><div class="kv">' +
      "<dt>名称</dt><dd>" +
      esc(store.name) +
      "</dd><dt>地址</dt><dd>" +
      esc(store.address) +
      "</dd><dt>电话</dt><dd>" +
      esc(store.phone) +
      "</dd><dt>时间</dt><dd>" +
      esc(store.hoursText) +
      "</dd></div></div></div>"
    );
  }

  function notFound(msg) {
    return '<div class="page"><div class="empty">' + esc(msg) + "</div></div>";
  }


  /* ---------- staff / boss ---------- */
  function viewToday() {
    var date = NF.todayISO();
    var staff = NF.getStaffList({ activeOnly: true });
    var chairs = NF.getChairs({ activeOnly: true });
    var appts = NF.getAppointments({ date: date });
    var pending = appts.filter(function (a) { return a.status === "pending_confirm"; });
    var settle = appts.filter(function (a) { return a.status === "pending_settle"; });
    var openH = 10 * 60;
    var closeH = 20 * 60;
    var span = closeH - openH;
    function left(min) { return ((Math.max(min, openH) - openH) / span) * 100; }
    function width(a) {
      var s = Math.max(NF.toMin(a.start), openH);
      var e = Math.min(NF.toMin(NF.lockEndOf(a)), closeH);
      return Math.max(4, ((e - s) / span) * 100);
    }
    var hours = "";
    for (var h = 10; h <= 20; h++) {
      hours += '<span style="left:' + ((h * 60 - openH) / span) * 100 + '%">' + h + ":00</span>";
    }
    var staffRows = staff
      .map(function (s) {
        var blocks = appts
          .filter(function (a) { return a.staffId === s.id && NF.LOCK_STATUSES.indexOf(a.status) >= 0; })
          .map(function (a) {
            return (
              '<a class="tl-block s-' +
              a.status +
              '" href="#/staff/appointments/' +
              a.id +
              '" style="left:' +
              left(NF.toMin(a.start)) +
              "%;width:" +
              width(a) +
              '%" title="' +
              esc(a.customerName + " " + a.start) +
              '">' +
              esc(a.customerName) +
              " " +
              a.start +
              "</a>"
            );
          })
          .join("");
        return '<div class="tl-row"><div class="tl-label">' + esc(s.name) + '</div><div class="tl-track">' + blocks + "</div></div>";
      })
      .join("");
    var chairRows = chairs
      .map(function (c) {
        var blocks = appts
          .filter(function (a) { return a.chairId === c.id && NF.LOCK_STATUSES.indexOf(a.status) >= 0; })
          .map(function (a) {
            return (
              '<a class="tl-block s-' +
              a.status +
              '" href="#/staff/appointments/' +
              a.id +
              '" style="left:' +
              left(NF.toMin(a.start)) +
              "%;width:" +
              width(a) +
              '%">' +
              esc(a.customerName) +
              "</a>"
            );
          })
          .join("");
        return '<div class="tl-row"><div class="tl-label">' + esc(c.name) + '</div><div class="tl-track">' + blocks + "</div></div>";
      })
      .join("");
    var list = appts.filter(function (a) { return a.status !== "voided"; });
    var inner =
      '<div class="eyebrow">Today</div><h1>今日档期 · ' +
      esc(NF.formatDateCN(date)) +
      "</h1>" +
      (pending.length ? '<div class="error-box">有 ' + pending.length + " 张待确认，请尽快处理，避免超时释放。</div>" : "") +
      (settle.length ? '<div class="ok-box">有 ' + settle.length + " 张待结算，服务已完成，技师与椅位已释放。</div>" : "") +
      '<h3 class="mt-16">技师视图</h3><div class="timeline-wrap"><div class="timeline"><div class="tl-head"><div class="tl-label">技师</div><div class="tl-hours">' +
      hours +
      "</div></div>" +
      staffRows +
      "</div></div>" +
      '<h3 class="mt-24">椅位视图</h3><div class="timeline-wrap"><div class="timeline"><div class="tl-head"><div class="tl-label">椅位</div><div class="tl-hours">' +
      hours +
      "</div></div>" +
      chairRows +
      "</div></div>" +
      '<h3 class="mt-24">预约列表</h3><div class="list-stack mt-8">' +
      (list.length ? list.map(function (a) { return apptRow(a, "staff"); }).join("") : '<div class="empty">今日暂无预约。</div>') +
      "</div>";
    return adminShell({ page: "today" }, inner);
  }

  function viewChairs(role) {
    role = role || "staff";
    var date = NF.todayISO();
    var cards = NF.getChairs({ activeOnly: false })
      .map(function (c) {
        var todays = NF.getAppointments({ date: date, chairId: c.id });
        var occupying = todays
          .filter(function (a) {
            return a.status === "in_service" || a.status === "arrived";
          })
          .sort(function (a, b) {
            if (a.status !== b.status) return a.status === "in_service" ? -1 : 1;
            return NF.toMin(a.start) - NF.toMin(b.start);
          })[0];
        var others = todays
          .filter(function (a) {
            return NF.LOCK_STATUSES.indexOf(a.status) >= 0 && a !== occupying;
          })
          .sort(function (a, b) {
            return NF.toMin(a.start) - NF.toMin(b.start);
          });
        var body = !c.active
          ? '<div class="faint">已停用</div>'
          : occupying
          ? "<div>使用中 · " +
            esc(NF.STATUS_LABEL[occupying.status] || occupying.status) +
            " · " +
            esc(occupying.customerName) +
            "</div><div class=\"faint\">" +
            esc(NF.serviceNamesOf(occupying)) +
            " · 占用至 " +
            esc(NF.lockEndOf(occupying)) +
            "</div>" +
            '<a class="btn btn-sm btn-ghost mt-8" href="#/' +
            role +
            "/appointments/" +
            occupying.id +
            '">查看预约</a>'
          : '<div class="pill st-completed">当前空闲</div>' +
            (others.length
              ? '<div class="faint mt-8">今日还有预约：' +
                others
                  .map(function (a) {
                    return a.start + " " + esc(a.customerName) + "（" + esc(NF.STATUS_LABEL[a.status] || a.status) + "）";
                  })
                  .join("；") +
                "</div>"
              : '<div class="faint mt-8">今日暂无占用</div>');
        return (
          '<div class="card chair-card ' +
          (occupying ? "busy" : "free") +
          '"><div class="eyebrow">' +
          esc(c.note || "工位") +
          "</div><h2>" +
          esc(c.name) +
          "</h2>" +
          body +
          "</div>"
        );
      })
      .join("");
    var inner = '<div class="eyebrow">Stations</div><h1>椅位状态</h1><p class="lead">同一椅位在占用时段（含缓冲）不可重叠。是否占用按预约的演示状态判断，不按此刻真实钟点。</p><div class="chair-grid mt-16">' + cards + "</div>";
    if (role === "boss") {
      inner +=
        '<div class="mt-24"><button class="btn btn-ghost" data-action="edit-chair-new">新增椅位</button></div>' +
        '<div class="list-stack mt-16">' +
        NF.getChairs()
          .map(function (c) {
            return (
              '<div class="manage-row"><div><strong>' +
              esc(c.name) +
              '</strong><div class="faint">' +
              esc(c.note || "") +
              (c.active ? "" : " · 已停用") +
              '</div></div><button class="btn btn-sm btn-ghost" data-action="edit-chair" data-id="' +
              c.id +
              '">编辑</button></div>'
            );
          })
          .join("") +
        "</div>";
    }
    return adminShell({ page: "chairs" }, inner);
  }

  function viewCustomers(role, route) {
    if (route.id) return viewCustomerDetail(route.id, role);
    var q = (route.query.q || "").trim();
    var list = NF.getCustomers().filter(function (c) {
      if (!q) return true;
      return (c.name + c.phone).indexOf(q) >= 0;
    });
    var inner =
      '<div class="toolbar"><div><div class="eyebrow">Customers</div><h1>顾客</h1></div></div>' +
      '<input class="search" data-action="search-customers" placeholder="搜索姓名或手机号" value="' +
      esc(q) +
      '" />' +
      '<div class="list-stack mt-16">' +
      list
        .map(function (c) {
          return (
            '<a class="cust-row" href="#/' +
            role +
            "/customers/" +
            c.id +
            '"><div><strong>' +
            esc(c.name) +
            (c.isMember ? ' <span class="pill st-completed">会员</span>' : "") +
            '</strong><div class="faint">' +
            esc(phoneMask(c.phone)) +
            " · 次卡余次 " +
            NF.getCards({ customerId: c.id, activeOnly: true }).reduce(function (s, x) { return s + x.remaining; }, 0) +
            "</div></div><span class=\"faint\">查看</span></a>"
          );
        })
        .join("") +
      "</div>";
    return adminShell({ page: "customers" }, inner);
  }

  function viewCustomerDetail(id, role) {
    var c = NF.getCustomer(id);
    if (!c) return adminShell({ page: "customers" }, notFound("找不到这位顾客。"));
    var cards = NF.getCards({ customerId: c.id });
    var appts = NF.getAppointments({ customerId: c.id }).slice().reverse();
    var cons = NF.getConsumptions({ customerId: c.id });
    var inner =
      '<a class="faint" href="#/' +
      role +
      '/customers">← 顾客列表</a><div class="toolbar"><div><div class="eyebrow">Profile</div><h1>' +
      esc(c.name) +
      "</h1></div>" +
      (c.isMember ? '<span class="pill st-completed">会员</span>' : '<button class="btn btn-sm" data-action="make-member" data-id="' + c.id + '">标记为会员</button>') +
      '</div><div class="kv card card-pad"><dt>电话</dt><dd>' +
      esc(phoneMask(c.phone)) +
      "</dd><dt>来源</dt><dd>" +
      esc(c.source || "未填写") +
      (c.sourceLocked ? "（已锁定）" : "") +
      "</dd><dt>备注</dt><dd>" +
      esc(c.note || "无") +
      "</dd></div>" +
      "<h3 class=\"mt-24\">次卡与核销</h3><div class=\"list-stack\">" +
      (cards.length
        ? cards
            .map(function (card) {
              return (
                '<div class="card card-pad"><div class="toolbar mb-0"><div><strong>' +
                esc(card.name) +
                '</strong><div class="faint">余 ' +
                card.remaining +
                " / " +
                card.total +
                " 次</div></div>" +
                (card.remaining > 0
                  ? '<button class="btn btn-sm" data-action="redeem-open" data-id="' + card.id + '">核销 1 次</button>'
                  : '<span class="pill">已用尽</span>') +
                "</div></div>"
              );
            })
            .join("")
        : '<div class="empty">暂无次卡。<button class="btn btn-sm mt-8" data-action="issue-card-open" data-cid="' +
          c.id +
          '">演示开卡</button></div>') +
      (cards.length
        ? '<button class="btn btn-sm btn-ghost" data-action="issue-card-open" data-cid="' + c.id + '">再开一张演示次卡</button>'
        : "") +
      "</div><h3 class=\"mt-24\">预约</h3><div class=\"list-stack\">" +
      appts.slice(0, 8).map(function (a) { return apptRow(a, role); }).join("") +
      "</div><h3 class=\"mt-24\">消费记录</h3><div class=\"list-stack\">" +
      (cons.length
        ? cons
            .map(function (x) {
              return '<div class="list-card card-pad">' + esc(x.date + " · " + x.serviceNames + " · " + x.methodLabel) + "</div>";
            })
            .join("")
        : '<div class="empty">暂无记录</div>') +
      "</div>";
    return adminShell({ page: "customers" }, inner);
  }

  function viewStaffMe() {
    var s = NF.getStaff(NF.getSession().staffId);
    var days = "";
    for (var i = 0; i < 7; i++) {
      var d = NF.addDays(NF.todayISO(), i);
      var iv = NF.workingIntervals(s, d);
      var ap = NF.getAppointments({ staffId: s.id, date: d }).filter(function (a) {
        return ["cancelled", "expired", "voided"].indexOf(a.status) < 0;
      });
      days +=
        '<div class="card card-pad mt-8"><strong>' +
        esc(NF.formatDateCN(d)) +
        '</strong><div class="faint">' +
        (iv.length ? iv.map(function (x) { return NF.toHHMM(x.start) + "–" + NF.toHHMM(x.end); }).join("，") : "休息") +
        "</div>" +
        (ap.length
          ? "<div class=\"list-stack mt-8\">" + ap.map(function (a) { return apptRow(a, "staff"); }).join("") + "</div>"
          : '<div class="help">暂无预约</div>') +
        "</div>";
    }
    var inner =
      '<div class="eyebrow">Mine</div><h1>' +
      esc(s.name) +
      "的排班</h1><p class=\"lead\">" +
      esc(s.title) +
      " · " +
      esc(s.bio) +
      "</p>" +
      days;
    return adminShell({ page: "me" }, inner);
  }

  function viewDashboard() {
    var metrics = NF.getDashboardMetrics();
    var today = NF.getAppointments({ date: NF.todayISO() });
    var inner =
      '<div class="eyebrow">Dashboard</div><h1>经营看板</h1>' +
      '<p class="help">以下八项指标全部由当前演示数据即时计算，不是真实经营数字，也不是外部报表。</p>' +
      '<div class="metrics mt-16">' +
      metrics
        .map(function (m) {
          return '<div class="metric"><div class="faint">' + esc(m.label) + '</div><div class="val">' + esc(m.value) + '</div><div class="hint">' + esc(m.hint) + "</div></div>";
        })
        .join("") +
      "</div><h3 class=\"mt-24\">今日预约</h3><div class=\"list-stack mt-8\">" +
      (today.length ? today.map(function (a) { return apptRow(a, "boss"); }).join("") : '<div class="empty">今日暂无预约</div>') +
      "</div>";
    return adminShell({ page: "dashboard" }, inner);
  }

  function viewBossAppointments(route) {
    if (route.id) return viewApptDetail(route.id, "boss");
    var date = route.query.date || NF.todayISO();
    var st = route.query.st || "";
    var list = NF.getAppointments({ date: date });
    if (st) list = list.filter(function (a) { return a.status === st; });
    var dates = "";
    for (var i = -3; i <= 7; i++) {
      var d = NF.addDays(NF.todayISO(), i);
      dates +=
        '<a class="chip' +
        (date === d ? " active" : "") +
        '" href="#/boss/appointments?date=' +
        d +
        (st ? "&st=" + st : "") +
        '">' +
        (i === 0 ? "今天 " : "") +
        d.slice(5) +
        "</a>";
    }
    var inner =
      '<div class="eyebrow">Bookings</div><h1>预约总览</h1><div class="chips mt-8">' +
      dates +
      '</div><div class="chips mt-8"><a class="chip' +
      (!st ? " active" : "") +
      '" href="#/boss/appointments?date=' +
      date +
      '">全部状态</a>' +
      Object.keys(NF.STATUS_LABEL)
        .map(function (k) {
          return '<a class="chip' + (st === k ? " active" : "") + '" href="#/boss/appointments?date=' + date + "&st=" + k + '">' + NF.STATUS_LABEL[k] + "</a>";
        })
        .join("") +
      '</div><div class="list-stack mt-16">' +
      (list.length ? list.map(function (a) { return apptRow(a, "boss"); }).join("") : '<div class="empty">这一天没有符合条件的预约。</div>') +
      "</div>";
    return adminShell({ page: "appointments" }, inner);
  }

  function viewOps() {
    var items = BOSS_SIDE.filter(function (x) { return ["dashboard", "appointments", "settings"].indexOf(x[0]) < 0; });
    var inner =
      '<div class="eyebrow">Operations</div><h1>经营</h1><div class="list-stack mt-16">' +
      items
        .map(function (it) {
          return '<a class="appt-row" href="#/boss/' + it[0] + '"><div><strong>' + it[1] + '</strong></div><span class="faint">进入</span></a>';
        })
        .join("") +
      "</div>";
    return adminShell({ page: "ops" }, inner);
  }

  function viewBossServices() {
    var list = NF.getServices();
    var inner =
      '<div class="toolbar"><div><div class="eyebrow">Services</div><h1>服务项目</h1></div>' +
      '<button class="btn" data-action="edit-service-new">新增项目</button></div><div class="list-stack">' +
      list
        .map(function (s) {
          return (
            '<div class="manage-row"><div><strong>' +
            esc(s.name) +
            (s.active ? "" : ' <span class="pill">已下架</span>') +
            '</strong><div class="faint">' +
            esc(s.category) +
            " · " +
            s.durationMinutes +
            " 分钟 · " +
            NF.formatMoney(s.price) +
            '</div></div><button class="btn btn-sm btn-ghost" data-action="edit-service" data-id="' +
            s.id +
            '">编辑</button></div>'
          );
        })
        .join("") +
      "</div>";
    return adminShell({ page: "services" }, inner);
  }

  function viewBossStaff() {
    var list = NF.getStaffList();
    var inner =
      '<div class="toolbar"><div><div class="eyebrow">Team</div><h1>员工与排班</h1></div>' +
      '<button class="btn" data-action="edit-staff-new">新增员工</button></div><div class="list-stack">' +
      list
        .map(function (s) {
          return (
            '<div class="manage-row"><div style="display:flex;gap:12px;align-items:center"><img class="avatar sm" src="' +
            esc(s.avatar) +
            '" alt="" /><div><strong>' +
            esc(s.name) +
            (s.active ? "" : ' <span class="pill">已停用</span>') +
            '</strong><div class="faint">' +
            esc(s.title) +
            " · 技能 " +
            s.skills.length +
            " 项</div></div></div><button class=\"btn btn-sm btn-ghost\" data-action=\"edit-staff\" data-id=\"" +
            s.id +
            '">编辑</button></div>'
          );
        })
        .join("") +
      "</div>";
    return adminShell({ page: "staff" }, inner);
  }

  function viewBossWorks() {
    var list = NF.getWorks();
    var inner =
      '<div class="toolbar"><div><div class="eyebrow">Works</div><h1>作品管理</h1></div>' +
      '<button class="btn" data-action="edit-work-new">新增作品</button></div>' +
      '<p class="help">演示作品使用自制抽象插画。首版建议由老板统一维护，店员端不开放自助上传。</p>' +
      '<div class="works-grid gallery mt-16">' +
      list
        .map(function (w) {
          return (
            '<div class="work-card"><div class="thumb"><img src="' +
            esc(w.image) +
            '" alt="" /></div><div class="meta"><strong>' +
            esc(w.title) +
            '</strong><div class="faint">' +
            esc(w.category) +
            (w.published ? "" : " · 未上架") +
            (w.featured ? " · 精选" : "") +
            '</div><button class="btn btn-sm btn-ghost mt-8" data-action="edit-work" data-id="' +
            w.id +
            '">编辑</button></div></div>'
          );
        })
        .join("") +
      "</div>";
    return adminShell({ page: "works" }, inner);
  }

  function viewBossMembers() {
    var products = NF.getCardProducts();
    var cards = NF.getCards();
    var inner =
      '<div class="toolbar"><div><div class="eyebrow">Cards</div><h1>会员与次卡产品</h1></div>' +
      '<button class="btn" data-action="edit-product-new">新增次卡产品</button></div>' +
      '<p class="help">次卡按凭证类实现：开卡后按次核销，不是余额账户。演示开卡不发生真实收款。</p>' +
      "<h3>次卡产品</h3><div class=\"list-stack\">" +
      products
        .map(function (p) {
          return (
            '<div class="manage-row"><div><strong>' +
            esc(p.name) +
            (p.active ? "" : " · 已停用") +
            '</strong><div class="faint">' +
            p.times +
            " 次 · " +
            NF.formatMoney(p.price) +
            '</div></div><button class="btn btn-sm btn-ghost" data-action="edit-product" data-id="' +
            p.id +
            '">编辑</button></div>'
          );
        })
        .join("") +
      "</div><h3 class=\"mt-24\">已开出的次卡</h3><div class=\"list-stack\">" +
      cards
        .map(function (c) {
          var cu = NF.getCustomer(c.customerId) || {};
          return (
            '<div class="manage-row"><div><strong>' +
            esc(cu.name || "") +
            " · " +
            esc(c.name) +
            '</strong><div class="faint">余 ' +
            c.remaining +
            " / " +
            c.total +
            "</div></div></div>"
          );
        })
        .join("") +
      "</div>";
    return adminShell({ page: "members" }, inner);
  }

  function viewReferrals() {
    var st = NF.getReferralStats();
    var inner =
      '<div class="eyebrow">Referrals</div><h1>推荐来源</h1>' +
      '<p class="help">规则：首次来源唯一、不能推荐自己、首次到店消费并生成记录后才算有效转化。数字来自演示数据。</p>' +
      '<div class="metrics mt-16"><div class="metric"><div class="faint">推荐记录</div><div class="val">' +
      st.total +
      '</div></div><div class="metric"><div class="faint">已转化</div><div class="val">' +
      st.converted +
      "</div></div></div><div class=\"list-stack mt-16\">" +
      (st.items.length
        ? st.items
            .map(function (r) {
              var c = NF.getCustomer(r.customerId) || {};
              var f = NF.getCustomer(r.referrerId) || {};
              return (
                '<div class="manage-row"><div><strong>' +
                esc(c.name || r.customerId) +
                '</strong><div class="faint">来源 ' +
                esc(r.source) +
                (f.name ? " · 推荐人 " + esc(f.name) : "") +
                (r.converted ? " · 已转化于 " + esc(r.convertedAt) : " · 尚未转化") +
                "</div></div></div>"
              );
            })
            .join("")
        : '<div class="empty">暂无推荐记录。</div>') +
      "</div>";
    return adminShell({ page: "referrals" }, inner);
  }

  function viewSettings() {
    var s = NF.getSettings();
    var store = NF.getStore();
    var inner =
      '<div class="eyebrow">Settings</div><h1>门店设置</h1>' +
      '<form data-submit="save-settings" class="card card-pad mt-16">' +
      '<div class="field"><label>门店名称</label><input name="name" value="' +
      esc(store.name) +
      '" /></div>' +
      '<div class="field"><label>口号</label><input name="slogan" value="' +
      esc(store.slogan) +
      '" /></div>' +
      '<div class="field"><label>介绍</label><textarea name="intro">' +
      esc(store.intro) +
      "</textarea></div>" +
      '<div class="field"><label>地址</label><input name="address" value="' +
      esc(store.address) +
      '" /></div>' +
      '<div class="field"><label>电话（演示）</label><input name="phone" value="' +
      esc(store.phone) +
      '" /></div>' +
      '<div class="field"><label>营业时间说明</label><input name="hoursText" value="' +
      esc(store.hoursText) +
      '" /></div>' +
      '<div class="field"><label>公告</label><textarea name="announcement">' +
      esc(store.announcement) +
      "</textarea></div>" +
      '<div class="field"><label>预约确认方式</label><select name="confirmMode">' +
      '<option value="manual"' +
      (s.confirmMode === "manual" ? " selected" : "") +
      ">店员确认（默认）</option>" +
      '<option value="auto"' +
      (s.confirmMode === "auto" ? " selected" : "") +
      ">自动确认</option></select>" +
      '<div class="help">只影响保存后新提交的预约。切换后请再下一单验证。</div></div>' +
      '<div class="field"><label>待确认时限（分钟）</label><input type="number" min="5" max="120" name="confirmTimeoutMinutes" value="' +
      esc(s.confirmTimeoutMinutes) +
      '" /></div>' +
      '<div class="field"><label>工位缓冲（0–15 分钟）</label><input type="number" min="0" max="15" name="bufferMinutes" value="' +
      esc(s.bufferMinutes) +
      '" />' +
      '<div class="help">当前为 ' +
      esc(s.bufferMinutes) +
      ' 分钟。建议默认值是 10 分钟，方便消毒整理与接手，待创始人确认。新预约会按当时的缓冲值写入占用区间。</div></div>' +
      '<button class="btn" type="submit">保存设置</button></form>' +
      '<div class="card card-pad mt-24"><h3>一键重置演示数据</h3><p class="muted">将恢复初始预约、次卡、作品和设置，并清除本机后续操作。</p>' +
      '<button class="btn btn-danger" data-action="reset">重置演示数据</button></div>' +
      '<p class="help mt-16">界面工作名仍为 NailFlow。中文品牌候选名「澄光」仅作建议，尚未确认。</p>';
    return adminShell({ page: "settings" }, inner);
  }


  /* ---------- actions & forms ---------- */
  function resultToast(res, okMsg) {
    if (res && res.ok) {
      toast(okMsg || "已完成", "ok");
      render();
    } else {
      toast((res && res.reasons && res.reasons.join(" ")) || "操作没有成功", "err");
    }
  }

  function handleReset() {
    confirmModal("重置演示数据？", "将恢复为初始演示预约、会员次卡和设置，本机已做的操作会消失。", function () {
      NF.reset();
      book = defaultBook();
      toast("演示数据已重置", "ok");
      go("#/customer/home");
    }, "确认重置");
  }

  function submitBook() {
    var ses = NF.getSession();
    var res = NF.createAppointment({
      customerId: ses.customerId,
      customerName: book.name,
      customerPhone: book.phone,
      serviceIds: book.serviceIds,
      staffId: book.staffId,
      chairId: book.chairId,
      date: book.date,
      start: book.start,
      refIds: book.refIds,
      customRefDataUrls: book.customRefDataUrls,
      note: book.note
    });
    if (!res.ok) {
      toast(res.reasons.join(" "), "err");
      openModal("无法提交预约", '<div class="error-box">' + res.reasons.map(esc).join("<br>") + "</div>", '<button class="btn grow" data-action="close-modal">知道了</button>');
      return;
    }
    var id = res.appointment.id;
    book = defaultBook();
    toast(res.appointment.status === "confirmed" ? "预约已提交并自动确认" : "预约已提交，等待店员确认", "ok");
    go("#/customer/appointments/" + id);
  }

  function openSettle(id) {
    var a = NF.getAppointment(id);
    if (!a) return;
    var cards = NF.applicableCards(a.customerId, a.serviceIds);
    var opts = cards
      .map(function (c) {
        return "<option value=\"" + c.id + "\">" + esc(c.name) + "（余 " + c.remaining + " 次）</option>";
      })
      .join("");
    openModal(
      "结算核销",
      '<p class="muted">金额 ' +
        NF.formatMoney(a.price) +
        "。本操作为演示结算，不发生真实收款。</p>" +
        '<div class="field"><label>方式</label><select id="settle-method"><option value="cash">到店现结</option>' +
        (cards.length ? '<option value="card">使用次卡</option>' : "") +
        "</select></div>" +
        (cards.length
          ? '<div class="field"><label>选择次卡</label><select id="settle-card">' + opts + "</select><div class=\"help\">适用项目按次扣减，余次不足时可补差。</div></div>"
          : '<p class="help">该顾客没有可用于本单项目的次卡。</p>'),
      '<button class="btn btn-ghost grow" data-action="close-modal">取消</button>' +
        '<button class="btn grow" data-action="settle-go" data-id="' +
        id +
        '">确认核销</button>'
    );
  }

  function openRedeem(id) {
    var card = NF.getCard(id);
    if (!card) return;
    openModal(
      "核销次卡",
      '<p class="muted">「' +
        esc(card.name) +
        "」当前余 " +
        card.remaining +
        " 次。将核销 1 次。这是凭证扣次，不是钱包扣款。</p>",
      '<button class="btn btn-ghost grow" data-action="close-modal">取消</button>' +
        '<button class="btn grow" data-action="redeem-go" data-id="' +
        id +
        '">确认核销 1 次</button>'
    );
  }

  function openIssueCard(cid) {
    var opts = NF.getCardProducts({ activeOnly: true })
      .map(function (p) {
        return "<option value=\"" + p.id + "\">" + esc(p.name) + " · " + NF.formatMoney(p.price) + "</option>";
      })
      .join("");
    openModal(
      "演示开卡",
      '<p class="muted">不会发生真实付款。</p><div class="field"><label>次卡产品</label><select id="issue-product">' +
        opts +
        "</select></div>",
      '<button class="btn btn-ghost grow" data-action="close-modal">取消</button>' +
        '<button class="btn grow" data-action="issue-go" data-cid="' +
        cid +
        '">确认开卡</button>'
    );
  }

  function serviceForm(s) {
    s = s || { name: "", category: "美甲", durationMinutes: 60, price: 88, desc: "", active: true };
    openModal(
      s.id ? "编辑项目" : "新增项目",
      '<form id="entity-form">' +
        hiddenId(s.id) +
        field("name", "名称", s.name) +
        field("category", "分类", s.category) +
        field("durationMinutes", "时长（分钟）", s.durationMinutes, "number") +
        field("price", "价格", s.price, "number") +
        area("desc", "说明", s.desc || "") +
        check("active", "上架", s.active !== false) +
        "</form>",
      '<button class="btn btn-ghost grow" data-action="close-modal">取消</button>' +
        '<button class="btn grow" data-action="save-service">保存</button>'
    );
  }

  function staffForm(s) {
    var avatars = ["assets/avatar-lin.svg", "assets/avatar-xu.svg", "assets/avatar-zhou.svg"];
    s = s || { name: "", title: "美甲师", bio: "", skills: [], active: true, avatar: avatars[0], schedule: NF.defaultWeek() };
    var skills = NF.getServices()
      .map(function (svc) {
        return (
          '<label class="check-item' +
          ((s.skills || []).indexOf(svc.id) >= 0 ? " selected" : "") +
          '"><input type="checkbox" name="skills" value="' +
          svc.id +
          '"' +
          ((s.skills || []).indexOf(svc.id) >= 0 ? " checked" : "") +
          " /> " +
          esc(svc.name) +
          "</label>"
        );
      })
      .join("");
    var days = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"]
      .map(function (name, i) {
        var on = s.schedule && s.schedule[i] && s.schedule[i].length;
        var block = on ? s.schedule[i][0] : { start: "10:00", end: "20:00" };
        return (
          '<label class="check-item"><input type="checkbox" name="dayon" data-day="' +
          i +
          '"' +
          (on ? " checked" : "") +
          " /> " +
          name +
          ' 营业　<input type="time" name="ds' +
          i +
          '" value="' +
          (block.start || "10:00") +
          '" /> – <input type="time" name="de' +
          i +
          '" value="' +
          (block.end || "20:00") +
          '" /></label>'
        );
      })
      .join("");
    openModal(
      s.id ? "编辑员工" : "新增员工",
      '<form id="entity-form">' +
        hiddenId(s.id) +
        field("name", "姓名", s.name) +
        field("title", "称呼", s.title || "") +
        area("bio", "简介", s.bio || "") +
        '<div class="field"><label>头像（抽象插画）</label><select name="avatar">' +
        avatars
          .map(function (a) {
            return "<option" + (s.avatar === a ? " selected" : "") + ">" + a + "</option>";
          })
          .join("") +
        "</select></div>" +
        check("active", "在职", s.active !== false) +
        "<h3>可做项目</h3><div class=\"check-grid\">" +
        skills +
        "</div><h3 class=\"mt-16\">排班</h3><p class=\"help\">休息默认 12:30–13:30。取消勾选即为休息日。</p>" +
        days +
        "</form>",
      '<button class="btn btn-ghost grow" data-action="close-modal">取消</button>' +
        '<button class="btn grow" data-action="save-staff">保存</button>'
    );
  }

  function chairForm(c) {
    c = c || { name: "", note: "", active: true };
    openModal(
      c.id ? "编辑椅位" : "新增椅位",
      '<form id="entity-form">' +
        hiddenId(c.id) +
        field("name", "名称", c.name) +
        field("note", "备注", c.note || "") +
        check("active", "启用", c.active !== false) +
        "</form>",
      '<button class="btn btn-ghost grow" data-action="close-modal">取消</button>' +
        '<button class="btn grow" data-action="save-chair">保存</button>'
    );
  }

  function workForm(w) {
    var images = [];
    for (var i = 1; i <= 12; i++) images.push("assets/works/w" + (i < 10 ? "0" : "") + i + ".svg");
    w = w || { title: "", category: "美甲", desc: "", artistId: NF.getStaffList({ activeOnly: true })[0].id, image: images[0], published: true, featured: false };
    openModal(
      w.id ? "编辑作品" : "新增作品",
      '<form id="entity-form">' +
        hiddenId(w.id) +
        field("title", "标题", w.title) +
        '<div class="field"><label>分类</label><select name="category"><option' +
        (w.category === "美甲" ? " selected" : "") +
        ">美甲</option><option" +
        (w.category === "美睫" ? " selected" : "") +
        ">美睫</option></select></div>" +
        '<div class="field"><label>关联技师</label><select name="artistId">' +
        NF.getStaffList()
          .map(function (s) {
            return "<option value=\"" + s.id + "\"" + (w.artistId === s.id ? " selected" : "") + ">" + esc(s.name) + "</option>";
          })
          .join("") +
        "</select></div>" +
        '<div class="field"><label>插画</label><select name="image">' +
        images
          .map(function (im) {
            return "<option" + (w.image === im ? " selected" : "") + ">" + im + "</option>";
          })
          .join("") +
        "</select></div>" +
        area("desc", "介绍", w.desc || "") +
        check("published", "上架", w.published !== false) +
        check("featured", "精选", !!w.featured) +
        "</form>",
      '<button class="btn btn-ghost grow" data-action="close-modal">取消</button>' +
        '<button class="btn grow" data-action="save-work">保存</button>'
    );
  }

  function productForm(p) {
    p = p || { name: "", times: 5, price: 500, desc: "", applicableServiceIds: [], active: true };
    var skills = NF.getServices()
      .map(function (svc) {
        return (
          '<label class="check-item"><input type="checkbox" name="applicableServiceIds" value="' +
          svc.id +
          '"' +
          ((p.applicableServiceIds || []).indexOf(svc.id) >= 0 ? " checked" : "") +
          " /> " +
          esc(svc.name) +
          "</label>"
        );
      })
      .join("");
    openModal(
      p.id ? "编辑次卡产品" : "新增次卡产品",
      '<form id="entity-form">' +
        hiddenId(p.id) +
        field("name", "名称", p.name) +
        field("times", "次数", p.times, "number") +
        field("price", "演示售价", p.price, "number") +
        area("desc", "说明", p.desc || "") +
        check("active", "上架", p.active !== false) +
        "<h3>适用项目</h3><div class=\"check-grid\">" +
        skills +
        "</div></form>",
      '<button class="btn btn-ghost grow" data-action="close-modal">取消</button>' +
        '<button class="btn grow" data-action="save-product">保存</button>'
    );
  }

  function hiddenId(id) {
    return id ? '<input type="hidden" name="id" value="' + esc(id) + '" />' : "";
  }
  function field(name, label, val, type) {
    return '<div class="field"><label>' + esc(label) + '</label><input name="' + name + '" type="' + (type || "text") + '" value="' + esc(val) + '" /></div>';
  }
  function area(name, label, val) {
    return '<div class="field"><label>' + esc(label) + '</label><textarea name="' + name + '">' + esc(val) + "</textarea></div>";
  }
  function check(name, label, on) {
    return '<label class="check-item"><input type="checkbox" name="' + name + '" ' + (on ? "checked" : "") + " /> " + esc(label) + "</label>";
  }
  function formJson() {
    var form = document.getElementById("entity-form");
    if (!form) return {};
    var data = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name) return;
      if (el.type === "checkbox") {
        if (el.name === "skills" || el.name === "applicableServiceIds" || el.name === "dayon") {
          data[el.name] = data[el.name] || [];
          if (el.checked) data[el.name].push(el.value || el.getAttribute("data-day"));
        } else data[el.name] = el.checked;
      } else if (el.type !== "submit") data[el.name] = el.value;
    });
    return data;
  }

  function resizeImage(file, cb) {
    if (!file || !file.type || file.type.indexOf("image/") !== 0) {
      toast("请选择图片文件", "err");
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var max = 900;
        var w = img.width, h = img.height;
        if (w > max || h > max) {
          var r = Math.min(max / w, max / h);
          w = Math.round(w * r);
          h = Math.round(h * r);
        }
        var canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        cb(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  /* ---------- router ---------- */
  function render() {
    NF.expireOverdue();
    var route = parseHash();
    var ses = NF.getSession();
    if (["customer", "staff", "boss"].indexOf(route.role) < 0) {
      go("#/" + ses.role + "/" + defaultPage(ses.role));
      return;
    }
    if (ses.role !== route.role) {
      NF.setSession({ role: route.role });
      ses = NF.getSession();
    }
    document.body.className = "role-" + ses.role;
    renderBar();
    renderTabs(route);
    var html = "";
    try {
      if (ses.role === "customer") html = renderCustomer(route);
      else if (ses.role === "staff") html = renderStaff(route);
      else html = renderBoss(route);
    } catch (err) {
      html = '<div class="page"><div class="error-box">页面渲染出错：' + esc(err.message) + "</div></div>";
      console.error(err);
    }
    $app.innerHTML = html;
    document.title = "NailFlow 演示 · " + (NF.getStore().name || "");
    startTick();
  }

  function renderCustomer(route) {
    switch (route.page) {
      case "home": return viewHome();
      case "works": return viewWorks(route);
      case "services": return viewServices();
      case "artists": return viewArtists(route);
      case "book":
        if (!book) book = defaultBook();
        applyBookQuery(route.query);
        return viewBook();
      case "appointments": return viewAppointments(route);
      case "member": return viewMember();
      case "me": return viewMe();
      default: return viewHome();
    }
  }

  function renderStaff(route) {
    switch (route.page) {
      case "today": return viewToday();
      case "appointments": return viewApptDetail(route.id, "staff");
      case "customers": return viewCustomers("staff", route);
      case "chairs": return viewChairs("staff");
      case "me": return viewStaffMe();
      default: return viewToday();
    }
  }

  function renderBoss(route) {
    switch (route.page) {
      case "dashboard": return viewDashboard();
      case "appointments": return viewBossAppointments(route);
      case "ops": return viewOps();
      case "services": return viewBossServices();
      case "staff": return viewBossStaff();
      case "chairs": return viewChairs("boss");
      case "works": return viewBossWorks();
      case "members": return viewBossMembers();
      case "customers": return viewCustomers("boss", route);
      case "referrals": return viewReferrals();
      case "settings": return viewSettings();
      default: return viewDashboard();
    }
  }

  function startTick() {
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = setInterval(function () {
      var changed = NF.expireOverdue();
      var nodes = document.querySelectorAll(".ok-box, .appt-row .faint");
      if (changed) render();
      else if (document.querySelector(".st-pending_confirm") && document.hasFocus()) {
        // light update of countdown texts by re-render could jump scroll; skip unless visible countdown labels exist
      }
    }, 5000);
  }

  function onAction(name, el, ev) {
    var id = el.getAttribute("data-id");
    switch (name) {
      case "switch-role":
        NF.setSession({ role: el.getAttribute("data-role") });
        go("#/" + el.getAttribute("data-role") + "/" + defaultPage(el.getAttribute("data-role")));
        break;
      case "switch-staff":
        NF.setSession({ staffId: el.value });
        toast("已切换为 " + (NF.getStaff(el.value) || {}).name, "ok");
        render();
        break;
      case "reset":
        handleReset();
        break;
      case "close-modal":
        if (el.classList.contains("modal-backdrop") && ev.target !== el) break;
        closeModal();
        break;
      case "run-confirm":
        if (window.__nfConfirm) window.__nfConfirm();
        break;
      case "book-toggle-service":
        if (!book) book = defaultBook();
        if (el.checked) {
          if (book.serviceIds.indexOf(id) < 0) book.serviceIds.push(id);
        } else book.serviceIds = book.serviceIds.filter(function (x) { return x !== id; });
        if (book.staffId && !NF.staffCanDo(NF.getStaff(book.staffId), book.serviceIds)) {
          book.staffId = "";
          book.start = "";
        }
        render();
        break;
      case "book-staff":
        book.staffId = id;
        book.start = "";
        render();
        break;
      case "book-date":
        book.date = el.getAttribute("data-date");
        book.start = "";
        render();
        break;
      case "book-chair":
        book.chairId = id;
        book.start = "";
        render();
        break;
      case "book-start":
        book.start = el.getAttribute("data-start");
        render();
        break;
      case "book-ref":
        if (book.refIds.indexOf(id) >= 0) book.refIds = book.refIds.filter(function (x) { return x !== id; });
        else book.refIds.push(id);
        render();
        break;
      case "book-remove-custom":
        book.customRefDataUrls.splice(Number(el.getAttribute("data-idx")), 1);
        render();
        break;
      case "book-next":
        if (book.step === 1 && !book.serviceIds.length) return toast("请选择至少一个项目", "err");
        if (book.step === 2 && !book.staffId) return toast("请选择技师", "err");
        if (book.step === 3 && (!book.start || !book.chairId)) return toast("请选择椅位和开始时间", "err");
        book.step = Math.min(4, book.step + 1);
        render();
        break;
      case "book-prev":
        book.step = Math.max(1, book.step - 1);
        render();
        break;
      case "book-submit":
        submitBook();
        break;
      case "confirm-appt":
        resultToast(NF.confirmAppointment(id, "店员"), "预约已确认");
        break;
      case "arrive-appt":
        resultToast(NF.arriveAppointment(id, "店员"), "已记到店");
        break;
      case "start-appt":
        resultToast(NF.startService(id, "店员"), "已开始服务");
        break;
      case "complete-appt":
        resultToast(NF.completeService(id, "店员"), "服务完成，档期已释放，待结算");
        break;
      case "cancel-appt":
        confirmModal("取消这张预约？", "取消后技师与椅位会立即释放。", function () {
          resultToast(NF.cancelAppointment(id, el.getAttribute("data-by") || "店员", "演示取消"), "预约已取消");
        }, "确认取消");
        break;
      case "void-appt":
        confirmModal("作废待结算？", "作废后不会生成消费记录，也不能再核销这一单。", function () {
          resultToast(NF.voidSettlement(id, "店员", "演示作废"), "已作废");
        }, "确认作废");
        break;
      case "settle-open":
        openSettle(id);
        break;
      case "settle-go": {
        var method = (document.getElementById("settle-method") || {}).value || "cash";
        var cardId = (document.getElementById("settle-card") || {}).value;
        closeModal();
        resultToast(NF.settleAppointment(id, { method: method, cardId: cardId, by: "店员" }), "结算完成（演示）");
        break;
      }
      case "redeem-open":
        openRedeem(id);
        break;
      case "redeem-go":
        closeModal();
        resultToast(NF.redeemCardDirect({ cardId: id, times: 1, by: "店员" }), "已核销 1 次");
        break;
      case "issue-card-open":
        openIssueCard(el.getAttribute("data-cid"));
        break;
      case "issue-go": {
        var pid = (document.getElementById("issue-product") || {}).value;
        closeModal();
        resultToast(NF.purchaseCard({ customerId: el.getAttribute("data-cid"), productId: pid, by: "店员演示开卡" }), "演示开卡成功");
        break;
      }
      case "buy-card":
        confirmModal("演示开卡？", "不会发生真实付款。开卡后可在结算时按次核销。", function () {
          resultToast(NF.purchaseCard({ customerId: NF.getSession().customerId, productId: id, by: "顾客演示购卡" }), "演示开卡成功");
        }, "确认开卡");
        break;
      case "make-member":
        NF.upsertCustomer({ id: id, isMember: true });
        toast("已标记为会员", "ok");
        render();
        break;
      case "copy-share":
        copyText(el.getAttribute("data-text") || "");
        break;
      case "sim-referral":
        simReferral();
        break;
      case "edit-service-new":
        serviceForm(null);
        break;
      case "edit-service":
        serviceForm(NF.getService(id));
        break;
      case "save-service": {
        var d = formJson();
        d.durationMinutes = Number(d.durationMinutes);
        d.price = Number(d.price);
        closeModal();
        resultToast(NF.upsertService(d), "项目已保存");
        break;
      }
      case "edit-staff-new":
        staffForm(null);
        break;
      case "edit-staff":
        staffForm(NF.getStaff(id));
        break;
      case "save-staff": {
        var sd = formJson();
        var form = document.getElementById("entity-form");
        sd.skills = [];
        sd.schedule = {};
        Array.prototype.forEach.call(form.querySelectorAll('[name="skills"]'), function (x) { if (x.checked) sd.skills.push(x.value); });
        for (var di = 0; di < 7; di++) {
          var on = form.querySelector('[name="dayon"][data-day="' + di + '"]');
          if (on && on.checked) {
            sd.schedule[di] = [{ start: form.elements["ds" + di].value, end: form.elements["de" + di].value, breaks: [{ start: "12:30", end: "13:30" }] }];
          } else sd.schedule[di] = [];
        }
        closeModal();
        resultToast(NF.upsertStaff(sd), "员工已保存");
        break;
      }
      case "edit-chair-new":
        chairForm(null);
        break;
      case "edit-chair":
        chairForm(NF.getChair(id));
        break;
      case "save-chair":
        closeModal();
        resultToast(NF.upsertChair(formJson()), "椅位已保存");
        break;
      case "edit-work-new":
        workForm(null);
        break;
      case "edit-work":
        workForm(NF.getWork(id));
        break;
      case "save-work":
        closeModal();
        resultToast(NF.upsertWork(formJson()), "作品已保存");
        break;
      case "edit-product-new":
        productForm(null);
        break;
      case "edit-product":
        productForm(NF.getState().cardProducts.filter(function (x) { return x.id === id; })[0]);
        break;
      case "save-product": {
        var pd = formJson();
        pd.times = Number(pd.times);
        pd.price = Number(pd.price);
        closeModal();
        resultToast(NF.upsertCardProduct(pd), "次卡产品已保存");
        break;
      }
      default:
        break;
    }
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { toast("模拟链接已复制（不会打开真实网页）", "ok"); },
        function () { toast(text, "ok"); }
      );
    } else {
      toast("模拟链接：" + text, "ok");
    }
  }

  function simReferral() {
    var me = NF.getSession().customerId;
    var n = NF.getCustomers().length + 1;
    var res = NF.upsertCustomer({
      name: "演示新客" + n,
      phone: "1390000" + (1000 + n),
      source: "门店分享",
      referrerId: me,
      note: "由分享链接模拟产生的新顾客，尚未到店消费，不算有效转化。"
    });
    if (!res.ok) return toast(res.reasons.join(" "), "err");
    toast("已生成模拟新客「" + res.customer.name + "」，来源已锁定。转化需等到店消费。", "ok");
  }

  document.addEventListener("click", function (ev) {
    var act = ev.target.closest("[data-action]");
    if (!act) return;
    var name = act.getAttribute("data-action");
    if (["book-toggle-service", "book-staff", "book-upload", "switch-staff"].indexOf(name) >= 0 && ev.type === "click" && (act.type === "checkbox" || act.type === "radio" || act.tagName === "SELECT" || act.type === "file")) {
      // let change handler work; but click on checkbox still fires. We'll handle change separately for these.
      if (act.type === "checkbox" || act.type === "radio" || act.type === "file" || act.tagName === "SELECT") return;
    }
    ev.preventDefault();
    onAction(name, act, ev);
  });

  document.addEventListener("change", function (ev) {
    var el = ev.target;
    if (el.matches("[data-action]")) {
      var name = el.getAttribute("data-action");
      if (name === "book-upload") {
        var file = el.files && el.files[0];
        resizeImage(file, function (url) {
          book.customRefDataUrls = book.customRefDataUrls || [];
          if (book.customRefDataUrls.length < 2) book.customRefDataUrls.push(url);
          render();
        });
        return;
      }
      onAction(name, el, ev);
    }
    if (el.matches("[data-bind]")) {
      var path = el.getAttribute("data-bind");
      if (path === "book.note") book.note = el.value;
      if (path === "book.name") book.name = el.value;
      if (path === "book.phone") book.phone = el.value;
    }
    if (el.matches("[data-action='search-customers']")) {
      var role = NF.getSession().role;
      go("#/" + role + "/customers?q=" + encodeURIComponent(el.value.trim()));
    }
  });

  document.addEventListener("submit", function (ev) {
    var form = ev.target.closest("[data-submit]");
    if (!form) return;
    ev.preventDefault();
    var kind = form.getAttribute("data-submit");
    if (kind === "save-settings") {
      var fd = new FormData(form);
      var res = NF.updateSettings({
        confirmMode: fd.get("confirmMode"),
        confirmTimeoutMinutes: Number(fd.get("confirmTimeoutMinutes")),
        bufferMinutes: Number(fd.get("bufferMinutes")),
        store: {
          name: fd.get("name"),
          slogan: fd.get("slogan"),
          intro: fd.get("intro"),
          address: fd.get("address"),
          phone: fd.get("phone"),
          hoursText: fd.get("hoursText"),
          announcement: fd.get("announcement")
        }
      });
      resultToast(res, "设置已保存，新预约将按新规则执行");
    }
  });

  window.addEventListener("hashchange", render);

  NF.load();
  if (!location.hash) location.hash = "#/customer/home";
  render();
})();
