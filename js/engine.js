/* NailFlow P2 demo engine. Browser + Node. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.NF = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var STORAGE_KEY = "nailflow-demo-v1";
  var LOCK_STATUSES = ["pending_confirm", "confirmed", "arrived", "in_service"];
  var STATUS_LABEL = {
    pending_confirm: "待确认",
    confirmed: "已确认",
    arrived: "已到店",
    in_service: "服务中",
    pending_settle: "待结算",
    completed: "已完成",
    cancelled: "已取消",
    expired: "已超时释放",
    voided: "已作废"
  };

  var memory = null;
  var idSeq = 1;

  function uid(prefix) {
    idSeq += 1;
    return prefix + "_" + Date.now().toString(36) + "_" + idSeq.toString(36);
  }

  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  function pad(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function todayISO(d) {
    d = d || new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function addDays(iso, n) {
    var p = iso.split("-").map(Number);
    var d = new Date(p[0], p[1] - 1, p[2]);
    d.setDate(d.getDate() + n);
    return todayISO(d);
  }

  function weekday(iso) {
    var p = iso.split("-").map(Number);
    return new Date(p[0], p[1] - 1, p[2]).getDay();
  }

  function toMin(hhmm) {
    var p = String(hhmm).split(":");
    return Number(p[0]) * 60 + Number(p[1]);
  }

  function toHHMM(min) {
    min = Math.max(0, Math.round(min));
    return pad(Math.floor(min / 60)) + ":" + pad(min % 60);
  }

  function formatDateCN(iso) {
    var p = iso.split("-").map(Number);
    var names = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    var d = new Date(p[0], p[1] - 1, p[2]);
    return p[1] + "月" + p[2] + "日 " + names[d.getDay()];
  }

  function formatMoney(n) {
    n = Number(n) || 0;
    return "¥" + n.toFixed(0);
  }

  function now() {
    return Date.now();
  }

  function overlaps(a0, a1, b0, b1) {
    return a0 < b1 && b0 < a1;
  }

  function sumDurations(services) {
    return services.reduce(function (s, x) { return s + Number(x.durationMinutes); }, 0);
  }

  function sumPrice(services) {
    return services.reduce(function (s, x) { return s + Number(x.price); }, 0);
  }

  function defaultWeek() {
    var day = [{ start: "10:00", end: "20:00", breaks: [{ start: "12:30", end: "13:30" }] }];
    return { 0: day, 1: day, 2: day, 3: day, 4: day, 5: day, 6: day };
  }

  function seed(today) {
    today = today || todayISO();
    var yesterday = addDays(today, -1);
    var twoAgo = addDays(today, -2);
    var tomorrow = addDays(today, 1);

    var store = {
      name: "澄光美甲美睫·演示店",
      slogan: "在日光里，把喜欢戴在手上",
      intro: "这是一间虚构的演示门店，用于体验 NailFlow 预约、作品展示与会员次卡流程。店内项目、档期、作品和顾客均为虚拟数据，不代表真实经营。",
      address: "演示市湖滨路 18 号（虚构地址）",
      phone: "010-0000-0000（演示号码）",
      hoursText: "每日 10:00–20:00（12:30–13:30 为整理休息）",
      announcement: "本店展示的是演示数据。节前档期较满，建议提前预约；价格与时长以提交前页面显示为准。"
    };

    var settings = {
      confirmMode: "manual", // manual | auto
      confirmTimeoutMinutes: 30,
      bufferMinutes: 10, // 建议默认值，待创始人确认
      demoLabel: "演示样品 · 虚拟数据 · 非真实经营数据"
    };

    var services = [
      { id: "svc_color", name: "经典单色美甲", category: "美甲", durationMinutes: 90, price: 128, desc: "均匀纯色，适合日常。含基础修型与护理。", active: true, tags: ["日常", "入门"] },
      { id: "svc_french", name: "柔光法式美甲", category: "美甲", durationMinutes: 100, price: 158, desc: "微笑线或延伸法式，气质干净。", active: true, tags: ["法式"] },
      { id: "svc_design", name: "造型款美甲", category: "美甲", durationMinutes: 150, price: 228, desc: "手绘、晕染或立体点缀，款式沟通建议提前附图。", active: true, tags: ["造型", "复杂"] },
      { id: "svc_remove", name: "卸甲护理", category: "美甲", durationMinutes: 40, price: 48, desc: "卸除旧甲并做基础护理。可与新作同单预约。", active: true, tags: ["护理"] },
      { id: "svc_repair", name: "美甲修补（单指）", category: "美甲", durationMinutes: 20, price: 28, desc: "单指修补。如需多指，请在备注说明。", active: true, tags: ["修补"] },
      { id: "svc_lash_natural", name: "日式美睫（自然款）", category: "美睫", durationMinutes: 120, price: 198, desc: "自然根数与弧度，适合日常妆感。", active: true, tags: ["自然"] },
      { id: "svc_lash_fairy", name: "仙女款美睫", category: "美睫", durationMinutes: 150, price: 268, desc: "更浓密、更卷翘的造型款。", active: true, tags: ["造型"] },
      { id: "svc_lash_fill", name: "美睫补睫", category: "美睫", durationMinutes: 60, price: 88, desc: "在原有基础上补根，需符合补睫间隔。", active: true, tags: ["补睫"] },
      { id: "svc_spa", name: "手部 SPA", category: "护理", durationMinutes: 45, price: 88, desc: "手部清洁、按摩与保湿，可与美甲同单。", active: true, tags: ["护理"] }
    ];

    var staff = [
      {
        id: "st_lin",
        name: "林清欢",
        title: "美甲师",
        bio: "擅长法式与花卉造型，手法细致，喜欢把款式做得干净。",
        skills: ["svc_color", "svc_french", "svc_design", "svc_remove", "svc_repair", "svc_spa"],
        avatar: "assets/avatar-lin.svg",
        active: true,
        schedule: defaultWeek()
      },
      {
        id: "st_xu",
        name: "许暮白",
        title: "美甲 / 美睫师",
        bio: "美甲与美睫都能做，适合一次想完成两个品类的客人。同一张预约仍由同一位技师完成。",
        skills: ["svc_color", "svc_french", "svc_design", "svc_remove", "svc_repair", "svc_lash_natural", "svc_lash_fairy", "svc_lash_fill", "svc_spa"],
        avatar: "assets/avatar-xu.svg",
        active: true,
        schedule: defaultWeek()
      },
      {
        id: "st_zhou",
        name: "周织云",
        title: "美睫师",
        bio: "专注美睫，自然款与仙女款都可沟通弧度和浓密度。",
        skills: ["svc_lash_natural", "svc_lash_fairy", "svc_lash_fill"],
        avatar: "assets/avatar-zhou.svg",
        active: true,
        schedule: defaultWeek()
      }
    ];

    var chairs = [
      { id: "ch_1", name: "1 号椅", note: "靠窗", active: true },
      { id: "ch_2", name: "2 号椅", note: "中央", active: true },
      { id: "ch_3", name: "3 号椅", note: "美睫专位", active: true }
    ];

    var works = [
      { id: "w01", title: "柔光法式", category: "美甲", artistId: "st_lin", image: "assets/works/w01.svg", desc: "浅裸底加奶油微笑线，适合通勤与仪式感之间。", published: true, featured: true },
      { id: "w02", title: "牡丹造型", category: "美甲", artistId: "st_lin", image: "assets/works/w02.svg", desc: "在豆沙底上做一朵收住的牡丹，适合想做焦点款的客人。", published: true, featured: true },
      { id: "w03", title: "香槟猫眼", category: "美甲", artistId: "st_xu", image: "assets/works/w03.svg", desc: "深香槟猫眼，光线走动时会有一条浅金。", published: true, featured: true },
      { id: "w04", title: "几何色块", category: "美甲", artistId: "st_lin", image: "assets/works/w04.svg", desc: "当代色块拼接，粉、金与墨色对比。", published: true, featured: false },
      { id: "w05", title: "珍珠香槟", category: "美甲", artistId: "st_xu", image: "assets/works/w05.svg", desc: "暖金珍珠点缀，适合婚礼或晚宴。", published: true, featured: true },
      { id: "w06", title: "极光晕染", category: "美甲", artistId: "st_xu", image: "assets/works/w06.svg", desc: "粉紫与薄金的极光晕染。", published: true, featured: false },
      { id: "w07", title: "墨线裸粉", category: "美甲", artistId: "st_lin", image: "assets/works/w07.svg", desc: "裸粉底加上极细线描花，干净不拥挤。", published: true, featured: false },
      { id: "w08", title: "静金单色", category: "美甲", artistId: "st_xu", image: "assets/works/w08.svg", desc: "低饱和金，适合不想要花纹、又希望有质感的客人。", published: true, featured: false },
      { id: "w09", title: "自然裸妆睫", category: "美睫", artistId: "st_zhou", image: "assets/works/w09.svg", desc: "根数克制，打开眼尾但不夸张。", published: true, featured: true },
      { id: "w10", title: "对称柔睫", category: "美睫", artistId: "st_zhou", image: "assets/works/w10.svg", desc: "左右对称的自然卷度，适合日常。", published: true, featured: false },
      { id: "w11", title: "卷翘美人睫", category: "美睫", artistId: "st_xu", image: "assets/works/w11.svg", desc: "更卷、更有存在感的仙女款参考。", published: true, featured: true },
      { id: "w12", title: "侧颜睫线", category: "美睫", artistId: "st_zhou", image: "assets/works/w12.svg", desc: "侧颜看过去的睫线延伸，强调流畅。", published: true, featured: false }
    ];

    var refs = [
      { id: "r01", title: "法式浅粉", category: "美甲", image: "assets/refs/r01.svg" },
      { id: "r02", title: "墨金细闪", category: "美甲", image: "assets/refs/r02.svg" },
      { id: "r03", title: "日落渐变", category: "美甲", image: "assets/refs/r03.svg" },
      { id: "r04", title: "线描小花", category: "美甲", image: "assets/refs/r04.svg" },
      { id: "r05", title: "雾紫法式", category: "美甲", image: "assets/refs/r05.svg" },
      { id: "r06", title: "自然睫参考", category: "美睫", image: "assets/refs/r06.svg" },
      { id: "r07", title: "卷翘睫参考", category: "美睫", image: "assets/refs/r07.svg" },
      { id: "r08", title: "暖金椭圆甲型", category: "美甲", image: "assets/refs/r08.svg" }
    ];

    var customers = [
      { id: "cu_xia", name: "陈夏至", phone: "13800002618", isMember: true, note: "当前演示顾客。喜欢干净的法式和单色。", source: "自行到店", referrerId: null, sourceLocked: true },
      { id: "cu_zhao", name: "赵晚橙", phone: "13900001352", isMember: true, note: "老客，常做造型款。", source: "朋友推荐", referrerId: "cu_xia", sourceLocked: true },
      { id: "cu_wu", name: "吴汀兰", phone: "13600008721", isMember: false, note: "第一次预约法式。", source: "自行到店", referrerId: null, sourceLocked: false },
      { id: "cu_li", name: "李疏影", phone: "13700006409", isMember: true, note: "美睫为主。", source: "门店分享", referrerId: null, sourceLocked: true },
      { id: "cu_gu", name: "顾南风", phone: "13500004567", isMember: false, note: "补睫客人。", source: "自行到店", referrerId: null, sourceLocked: true }
    ];

    var cardProducts = [
      { id: "cp_nail5", name: "经典美甲 5 次卡", times: 5, price: 580, applicableServiceIds: ["svc_color", "svc_french"], desc: "可用于经典单色或柔光法式，按次核销。不是储值钱包。", active: true },
      { id: "cp_lash3", name: "自然款美睫 3 次卡", times: 3, price: 528, applicableServiceIds: ["svc_lash_natural"], desc: "仅可用于日式美睫（自然款），按次核销。", active: true }
    ];

    var cards = [
      { id: "card_xia_nail", customerId: "cu_xia", productId: "cp_nail5", name: "经典美甲 5 次卡", remaining: 3, total: 5, applicableServiceIds: ["svc_color", "svc_french"], openedAt: twoAgo + "T11:00:00", status: "active" },
      { id: "card_li_lash", customerId: "cu_li", productId: "cp_lash3", name: "自然款美睫 3 次卡", remaining: 2, total: 3, applicableServiceIds: ["svc_lash_natural"], openedAt: yesterday + "T15:20:00", status: "active" }
    ];

    function appt(o) {
      return Object.assign({
        refIds: [],
        customRefDataUrls: [],
        note: "",
        cancelReason: "",
        history: []
      }, o);
    }

    function hist(at, action, by, text) {
      return { at: at, action: action, by: by, text: text };
    }

    var t10 = new Date(today + "T10:00:00").getTime();
    var t11 = new Date(today + "T11:00:00").getTime();
    var t0930 = new Date(today + "T09:30:00").getTime();
    var y15 = new Date(yesterday + "T15:00:00").getTime();
    var y17 = new Date(yesterday + "T17:10:00").getTime();
    var y18 = new Date(yesterday + "T18:00:00").getTime();
    var two15 = new Date(twoAgo + "T14:00:00").getTime();
    var two16 = new Date(twoAgo + "T16:00:00").getTime();

    var appointments = [
      appt({
        id: "ap_zhao_design",
        customerId: "cu_zhao", customerName: "赵晚橙", customerPhone: "13900001352",
        serviceIds: ["svc_design"], staffId: "st_lin", chairId: "ch_1",
        date: today, start: "10:00", durationMinutes: 150, bufferMinutes: 10, price: 228,
        status: "in_service",
        createdAt: addDays(today, -3) + "T18:00:00",
        confirmedAt: addDays(today, -3) + "T18:10:00",
        arrivedAt: today + "T09:55:00",
        startedAt: today + "T10:00:00",
        note: "想做牡丹造型，已附图。",
        refIds: ["r04"],
        history: [
          hist(t10 - 86400000 * 3, "create", "顾客", "提交预约"),
          hist(t10 - 86400000 * 3 + 600000, "confirm", "店员", "已确认"),
          hist(new Date(today + "T09:55:00").getTime(), "arrive", "店员", "已到店"),
          hist(t10, "start", "店员", "开始服务")
        ]
      }),
      appt({
        id: "ap_wu_french",
        customerId: "cu_wu", customerName: "吴汀兰", customerPhone: "13600008721",
        serviceIds: ["svc_french"], staffId: "st_lin", chairId: "ch_1",
        date: today, start: "14:00", durationMinutes: 100, bufferMinutes: 10, price: 158,
        status: "confirmed",
        createdAt: yesterday + "T20:12:00",
        confirmedAt: yesterday + "T20:20:00",
        note: "第一次做法式，希望微笑线细一点。",
        refIds: ["r01"],
        history: [
          hist(y15 + 3600 * 5 * 1000, "create", "顾客", "提交预约"),
          hist(y15 + 3600 * 5 * 1000 + 480000, "confirm", "店员", "已确认")
        ]
      }),
      appt({
        id: "ap_li_lash",
        customerId: "cu_li", customerName: "李疏影", customerPhone: "13700006409",
        serviceIds: ["svc_lash_natural"], staffId: "st_xu", chairId: "ch_3",
        date: today, start: "10:00", durationMinutes: 120, bufferMinutes: 10, price: 198,
        status: "confirmed",
        createdAt: yesterday + "T11:00:00",
        confirmedAt: yesterday + "T11:08:00",
        refIds: ["r06"],
        history: [
          hist(y15 - 3600 * 4 * 1000, "create", "顾客", "提交预约"),
          hist(y15 - 3600 * 4 * 1000 + 480000, "confirm", "店员", "已确认")
        ]
      }),
      appt({
        id: "ap_xia_color",
        customerId: "cu_xia", customerName: "陈夏至", customerPhone: "13800002618",
        serviceIds: ["svc_color"], staffId: "st_xu", chairId: "ch_2",
        date: today, start: "15:00", durationMinutes: 90, bufferMinutes: 10, price: 128,
        status: "pending_confirm",
        createdAt: new Date().toISOString(),
        confirmDeadline: Date.now() + 28 * 60 * 1000,
        note: "想用次卡抵一次经典单色。倒计时从打开演示时重新起算，便于随时体验确认/超时。",
        refIds: ["r08"],
        history: [hist(new Date(today + "T09:40:00").getTime(), "create", "顾客", "提交预约，等待店员确认")]
      }),
      appt({
        id: "ap_gu_fill",
        customerId: "cu_gu", customerName: "顾南风", customerPhone: "13500004567",
        serviceIds: ["svc_lash_fill"], staffId: "st_zhou", chairId: "ch_3",
        date: today, start: "14:30", durationMinutes: 60, bufferMinutes: 10, price: 88,
        status: "arrived",
        createdAt: yesterday + "T16:00:00",
        confirmedAt: yesterday + "T16:05:00",
        arrivedAt: today + "T14:20:00",
        history: [
          hist(y17 - 3600000, "create", "顾客", "提交预约"),
          hist(y17 - 3300000, "confirm", "店员", "已确认"),
          hist(new Date(today + "T14:20:00").getTime(), "arrive", "店员", "已到店")
        ]
      }),
      appt({
        id: "ap_li_yest",
        customerId: "cu_li", customerName: "李疏影", customerPhone: "13700006409",
        serviceIds: ["svc_lash_natural"], staffId: "st_zhou", chairId: "ch_3",
        date: yesterday, start: "15:00", durationMinutes: 120, bufferMinutes: 10, price: 198,
        status: "completed",
        createdAt: twoAgo + "T12:00:00",
        confirmedAt: twoAgo + "T12:06:00",
        arrivedAt: yesterday + "T14:55:00",
        startedAt: yesterday + "T15:00:00",
        completedAt: yesterday + "T17:00:00",
        settledAt: yesterday + "T17:08:00",
        settleMethod: "card",
        settleAmount: 0,
        cardUsedId: "card_li_lash",
        cardDeductTimes: 1,
        history: [
          hist(two15, "create", "顾客", "提交预约"),
          hist(two15 + 360000, "confirm", "店员", "已确认"),
          hist(y15, "start", "店员", "开始服务"),
          hist(y17, "complete", "店员", "服务完成，进入待结算"),
          hist(y17 + 8 * 60000, "settle", "店员", "次卡扣 1 次，已完成")
        ]
      }),
      appt({
        id: "ap_xia_yest",
        customerId: "cu_xia", customerName: "陈夏至", customerPhone: "13800002618",
        serviceIds: ["svc_french"], staffId: "st_lin", chairId: "ch_2",
        date: yesterday, start: "11:00", durationMinutes: 100, bufferMinutes: 10, price: 158,
        status: "completed",
        createdAt: twoAgo + "T09:00:00",
        confirmedAt: twoAgo + "T09:04:00",
        startedAt: yesterday + "T11:00:00",
        completedAt: yesterday + "T12:40:00",
        settledAt: yesterday + "T12:48:00",
        settleMethod: "card",
        settleAmount: 0,
        cardUsedId: "card_xia_nail",
        cardDeductTimes: 1,
        history: [
          hist(two15 - 3600 * 5 * 1000, "create", "顾客", "提交预约"),
          hist(two15 - 3600 * 5 * 1000 + 240000, "confirm", "店员", "已确认"),
          hist(y15 - 3600 * 4 * 1000, "complete", "店员", "服务完成"),
          hist(y15 - 3600 * 4 * 1000 + 480000, "settle", "店员", "次卡扣 1 次")
        ]
      }),
      appt({
        id: "ap_zhao_two",
        customerId: "cu_zhao", customerName: "赵晚橙", customerPhone: "13900001352",
        serviceIds: ["svc_color", "svc_spa"], staffId: "st_lin", chairId: "ch_1",
        date: twoAgo, start: "14:00", durationMinutes: 135, bufferMinutes: 10, price: 216,
        status: "completed",
        createdAt: addDays(today, -5) + "T10:00:00",
        confirmedAt: addDays(today, -5) + "T10:10:00",
        startedAt: twoAgo + "T14:00:00",
        completedAt: twoAgo + "T16:15:00",
        settledAt: twoAgo + "T16:20:00",
        settleMethod: "cash",
        settleAmount: 216,
        history: [
          hist(two16, "create", "顾客", "提交预约（单色+手部SPA）"),
          hist(two16 + 600000, "confirm", "店员", "已确认"),
          hist(two16, "settle", "店员", "到店现结 ¥216")
        ]
      }),
      appt({
        id: "ap_wu_pending_settle",
        customerId: "cu_wu", customerName: "吴汀兰", customerPhone: "13600008721",
        serviceIds: ["svc_remove"], staffId: "st_xu", chairId: "ch_2",
        date: today, start: "13:30", durationMinutes: 40, bufferMinutes: 10, price: 48,
        status: "pending_settle",
        createdAt: yesterday + "T21:00:00",
        confirmedAt: yesterday + "T21:02:00",
        arrivedAt: today + "T13:28:00",
        startedAt: today + "T13:30:00",
        completedAt: today + "T14:10:00",
        note: "卸甲后来再约新作。",
        history: [
          hist(t0930, "create", "顾客", "提交预约"),
          hist(t0930 + 120000, "confirm", "店员", "已确认"),
          hist(new Date(today + "T13:30:00").getTime(), "start", "店员", "开始服务"),
          hist(new Date(today + "T14:10:00").getTime(), "complete", "店员", "服务完成，椅位与技师已释放，待结算")
        ]
      }),
      appt({
        id: "ap_xia_tomorrow",
        customerId: "cu_xia", customerName: "陈夏至", customerPhone: "13800002618",
        serviceIds: ["svc_spa"], staffId: "st_lin", chairId: "ch_2",
        date: tomorrow, start: "16:00", durationMinutes: 45, bufferMinutes: 10, price: 88,
        status: "confirmed",
        createdAt: today + "T08:30:00",
        confirmedAt: today + "T08:35:00",
        history: [
          hist(new Date(today + "T08:30:00").getTime(), "create", "顾客", "提交预约"),
          hist(new Date(today + "T08:35:00").getTime(), "confirm", "店员", "已确认")
        ]
      })
    ];

    var ledger = [
      { id: "ld_1", cardId: "card_xia_nail", customerId: "cu_xia", appointmentId: "ap_xia_yest", delta: -1, remainingAfter: 4, at: yesterday + "T12:48:00", by: "店员", text: "柔光法式美甲结算，扣 1 次" },
      { id: "ld_2", cardId: "card_xia_nail", customerId: "cu_xia", appointmentId: "ap_color_old", delta: -1, remainingAfter: 3, at: twoAgo + "T16:40:00", by: "店员", text: "经典单色美甲结算，扣 1 次" },
      { id: "ld_3", cardId: "card_li_lash", customerId: "cu_li", appointmentId: "ap_li_yest", delta: -1, remainingAfter: 2, at: yesterday + "T17:08:00", by: "店员", text: "日式美睫（自然款）结算，扣 1 次" },
      { id: "ld_open_xia", cardId: "card_xia_nail", customerId: "cu_xia", appointmentId: null, delta: 5, remainingAfter: 5, at: twoAgo + "T11:00:00", by: "演示购卡", text: "开通经典美甲 5 次卡（演示，非真实付款）" },
      { id: "ld_open_li", cardId: "card_li_lash", customerId: "cu_li", appointmentId: null, delta: 3, remainingAfter: 3, at: yesterday + "T15:20:00", by: "演示购卡", text: "开通自然款美睫 3 次卡（演示，非真实付款）" }
    ];

    var consumptions = [
      { id: "cs_1", customerId: "cu_xia", appointmentId: "ap_xia_yest", date: yesterday, amount: 0, method: "card", methodLabel: "次卡扣 1 次", serviceNames: "柔光法式美甲", staffId: "st_lin" },
      { id: "cs_2", customerId: "cu_zhao", appointmentId: "ap_zhao_two", date: twoAgo, amount: 216, method: "cash", methodLabel: "到店现结", serviceNames: "经典单色美甲、手部 SPA", staffId: "st_lin" },
      { id: "cs_3", customerId: "cu_li", appointmentId: "ap_li_yest", date: yesterday, amount: 0, method: "card", methodLabel: "次卡扣 1 次", serviceNames: "日式美睫（自然款）", staffId: "st_zhou" }
    ];

    // 赵晚橙由陈夏至推荐，首次到店消费已完成，算有效转化
    var referrals = [
      { id: "rf_1", customerId: "cu_zhao", referrerId: "cu_xia", source: "朋友推荐", converted: true, convertedAt: twoAgo, appointmentId: "ap_zhao_two" }
    ];

    return {
      version: 1,
      seededOn: today,
      store: store,
      settings: settings,
      services: services,
      staff: staff,
      chairs: chairs,
      works: works,
      refs: refs,
      customers: customers,
      cardProducts: cardProducts,
      cards: cards,
      appointments: appointments,
      ledger: ledger,
      consumptions: consumptions,
      referrals: referrals,
      session: {
        role: "customer",
        customerId: "cu_xia",
        staffId: "st_lin"
      }
    };
  }

  function storageAvailable() {
    try {
      return typeof localStorage !== "undefined";
    } catch (e) {
      return false;
    }
  }

  function readStorage() {
    if (!storageAvailable()) return memory;
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeStorage(state) {
    memory = state;
    if (storageAvailable()) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (e) {
        // quota; still keep memory
      }
    }
  }

  function getState() {
    if (!memory) {
      memory = readStorage();
      if (!memory || !memory.version) {
        memory = seed();
        writeStorage(memory);
      }
    }
    return memory;
  }

  function save() {
    writeStorage(getState());
  }

  function reset() {
    memory = seed();
    writeStorage(memory);
    return memory;
  }

  function load() {
    memory = readStorage();
    if (!memory || !memory.version) memory = seed();
    expireOverdue(true);
    return memory;
  }

  function findById(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function getStore() { return getState().store; }
  function getSettings() { return getState().settings; }
  function getSession() { return getState().session; }

  function setSession(partial) {
    Object.assign(getState().session, partial);
    save();
  }

  function getServices(opts) {
    opts = opts || {};
    return getState().services.filter(function (s) { return opts.activeOnly ? s.active : true; });
  }

  function getService(id) { return findById(getState().services, id); }

  function getStaffList(opts) {
    opts = opts || {};
    return getState().staff.filter(function (s) { return opts.activeOnly ? s.active : true; });
  }

  function getStaff(id) { return findById(getState().staff, id); }
  function getChairs(opts) {
    opts = opts || {};
    return getState().chairs.filter(function (c) { return opts.activeOnly ? c.active : true; });
  }
  function getChair(id) { return findById(getState().chairs, id); }
  function getWorks(opts) {
    opts = opts || {};
    return getState().works.filter(function (w) {
      if (opts.published && !w.published) return false;
      if (opts.featured && !w.featured) return false;
      if (opts.category && opts.category !== "全部" && w.category !== opts.category) return false;
      if (opts.artistId && w.artistId !== opts.artistId) return false;
      return true;
    });
  }
  function getWork(id) { return findById(getState().works, id); }
  function getRefs(opts) {
    opts = opts || {};
    return getState().refs.filter(function (r) {
      if (opts.category && opts.category !== "全部" && r.category !== opts.category) return false;
      return true;
    });
  }
  function getRef(id) { return findById(getState().refs, id); }
  function getCustomers() { return getState().customers; }
  function getCustomer(id) { return findById(getState().customers, id); }
  function getCardProducts(opts) {
    opts = opts || {};
    return getState().cardProducts.filter(function (p) { return opts.activeOnly ? p.active : true; });
  }
  function getCards(opts) {
    opts = opts || {};
    return getState().cards.filter(function (c) {
      if (opts.customerId && c.customerId !== opts.customerId) return false;
      if (opts.activeOnly && c.status !== "active") return false;
      return true;
    });
  }
  function getCard(id) { return findById(getState().cards, id); }
  function getLedger(opts) {
    opts = opts || {};
    return getState().ledger.filter(function (x) {
      if (opts.customerId && x.customerId !== opts.customerId) return false;
      if (opts.cardId && x.cardId !== opts.cardId) return false;
      return true;
    }).slice().sort(function (a, b) { return a.at < b.at ? 1 : -1; });
  }
  function getConsumptions(opts) {
    opts = opts || {};
    return getState().consumptions.filter(function (x) {
      if (opts.customerId && x.customerId !== opts.customerId) return false;
      return true;
    }).slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  }

  function getAppointments(opts) {
    opts = opts || {};
    return getState().appointments.filter(function (a) {
      if (opts.date && a.date !== opts.date) return false;
      if (opts.staffId && a.staffId !== opts.staffId) return false;
      if (opts.customerId && a.customerId !== opts.customerId) return false;
      if (opts.chairId && a.chairId !== opts.chairId) return false;
      if (opts.status) {
        var st = Array.isArray(opts.status) ? opts.status : [opts.status];
        if (st.indexOf(a.status) < 0) return false;
      }
      return true;
    }).slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return toMin(a.start) - toMin(b.start);
    });
  }

  function getAppointment(id) { return findById(getState().appointments, id); }

  function resolveServices(ids) {
    var list = [];
    (ids || []).forEach(function (id) {
      var s = getService(id);
      if (s) list.push(s);
    });
    return list;
  }

  function occupyEnd(appt) {
    return toMin(appt.start) + Number(appt.durationMinutes) + Number(appt.bufferMinutes || 0);
  }

  function occupyStart(appt) {
    return toMin(appt.start);
  }

  function isLocking(appt) {
    return LOCK_STATUSES.indexOf(appt.status) >= 0;
  }

  function workingIntervals(staff, date) {
    if (!staff || !staff.active) return [];
    var day = staff.schedule[weekday(date)];
    if (!day || !day.length) return [];
    var out = [];
    day.forEach(function (block) {
      var start = toMin(block.start);
      var end = toMin(block.end);
      var breaks = (block.breaks || []).slice().sort(function (a, b) { return toMin(a.start) - toMin(b.start); });
      var cursor = start;
      breaks.forEach(function (br) {
        var bs = toMin(br.start), be = toMin(br.end);
        if (be <= cursor || bs >= end) return;
        if (bs > cursor) out.push({ start: cursor, end: bs });
        cursor = Math.max(cursor, be);
      });
      if (cursor < end) out.push({ start: cursor, end: end });
    });
    return out;
  }

  function getOccupiedIntervals(opts) {
    opts = opts || {};
    var list = getAppointments({ date: opts.date }).filter(function (a) {
      if (!isLocking(a)) return false;
      if (opts.excludeId && a.id === opts.excludeId) return false;
      if (opts.staffId && a.staffId !== opts.staffId) return false;
      if (opts.chairId && a.chairId !== opts.chairId) return false;
      if (!opts.staffId && !opts.chairId) return true;
      return true;
    });
    // If both staff and chair requested as OR? Callers should call separately.
    return list.map(function (a) {
      return { start: occupyStart(a), end: occupyEnd(a), appointment: a };
    });
  }

  function staffCanDo(staff, serviceIds) {
    if (!staff || !staff.active) return false;
    return serviceIds.every(function (id) { return staff.skills.indexOf(id) >= 0; });
  }

  function getEligibleStaff(serviceIds) {
    return getStaffList({ activeOnly: true }).filter(function (s) { return staffCanDo(s, serviceIds); });
  }

  function checkConflict(opts) {
    var reasons = [];
    var staff = getStaff(opts.staffId);
    var chair = getChair(opts.chairId);
    if (!staff || !staff.active) reasons.push("所选技师不可用。");
    if (!chair || !chair.active) reasons.push("所选椅位不可用。");
    var start = typeof opts.start === "number" ? opts.start : toMin(opts.start);
    var duration = Number(opts.duration);
    var buffer = opts.bufferMinutes != null ? Number(opts.bufferMinutes) : Number(getSettings().bufferMinutes);
    var end = start + duration + buffer;
    if (staff) {
      var works = workingIntervals(staff, opts.date);
      var serviceEnd = start + duration;
      var inShift = works.some(function (w) { return start >= w.start && serviceEnd <= w.end; });
      if (!inShift) reasons.push("该时段的服务时间不在 " + staff.name + " 的排班内（休息时段不可开始或做到一半）。缓冲时间可以进入休息或收工整理。");
      getOccupiedIntervals({ date: opts.date, staffId: staff.id, excludeId: opts.excludeId }).forEach(function (iv) {
        if (overlaps(start, end, iv.start, iv.end)) {
          reasons.push(staff.name + " 在 " + toHHMM(iv.start) + "–" + toHHMM(iv.end) + " 已有占用（含缓冲），不能重叠。");
        }
      });
    }
    if (chair) {
      getOccupiedIntervals({ date: opts.date, chairId: chair.id, excludeId: opts.excludeId }).forEach(function (iv) {
        if (overlaps(start, end, iv.start, iv.end)) {
          reasons.push(chair.name + " 在 " + toHHMM(iv.start) + "–" + toHHMM(iv.end) + " 已有占用（含缓冲），不能重叠。");
        }
      });
    }
    return { ok: reasons.length === 0, reasons: unique(reasons), start: start, end: end, buffer: buffer };
  }

  function unique(arr) {
    var s = [];
    arr.forEach(function (x) { if (s.indexOf(x) < 0) s.push(x); });
    return s;
  }

  function getAvailableStarts(opts) {
    var staff = getStaff(opts.staffId);
    var duration = Number(opts.duration);
    var buffer = opts.bufferMinutes != null ? Number(opts.bufferMinutes) : Number(getSettings().bufferMinutes);
    var need = duration + buffer;
    var starts = [];
    if (!staff) return starts;
    workingIntervals(staff, opts.date).forEach(function (w) {
      for (var t = Math.ceil(w.start / 15) * 15; t + need <= w.end; t += 15) {
        var chk = checkConflict({
          staffId: opts.staffId,
          chairId: opts.chairId,
          date: opts.date,
          start: t,
          duration: duration,
          bufferMinutes: buffer,
          excludeId: opts.excludeId
        });
        if (chk.ok) starts.push(t);
      }
    });
    return starts;
  }

  function pushHist(appt, action, by, text) {
    appt.history = appt.history || [];
    appt.history.push({ at: now(), action: action, by: by, text: text });
  }

  function createAppointment(input) {
    var services = resolveServices(input.serviceIds);
    if (!services.length) return { ok: false, reasons: ["请至少选择一个服务项目。"] };
    var staff = getStaff(input.staffId);
    if (!staff) return { ok: false, reasons: ["请选择技师。"] };
    if (!staffCanDo(staff, input.serviceIds)) {
      return { ok: false, reasons: ["同一张预约须由同一位技师完成，且该技师需要会做所选的全部项目。"] };
    }
    if (!input.chairId) return { ok: false, reasons: ["请选择椅位。"] };
    if (!input.date || !input.start) return { ok: false, reasons: ["请选择日期和开始时间。"] };
    var duration = sumDurations(services);
    var price = sumPrice(services);
    var buffer = Number(getSettings().bufferMinutes);
    var chk = checkConflict({
      staffId: input.staffId,
      chairId: input.chairId,
      date: input.date,
      start: input.start,
      duration: duration,
      bufferMinutes: buffer
    });
    if (!chk.ok) return { ok: false, reasons: chk.reasons };
    var auto = getSettings().confirmMode === "auto";
    var createdAt = todayISO() + "T" + toHHMM(new Date().getHours() * 60 + new Date().getMinutes()) + ":00";
    var appt = {
      id: uid("ap"),
      customerId: input.customerId,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      serviceIds: input.serviceIds.slice(),
      staffId: input.staffId,
      chairId: input.chairId,
      date: input.date,
      start: typeof input.start === "number" ? toHHMM(input.start) : input.start,
      durationMinutes: duration,
      bufferMinutes: buffer,
      price: price,
      status: auto ? "confirmed" : "pending_confirm",
      createdAt: createdAt,
      confirmedAt: auto ? createdAt : null,
      confirmDeadline: auto ? null : now() + Number(getSettings().confirmTimeoutMinutes) * 60 * 1000,
      refIds: input.refIds || [],
      customRefDataUrls: input.customRefDataUrls || [],
      note: input.note || "",
      history: []
    };
    pushHist(appt, "create", "顾客", auto ? "提交预约，系统已自动确认" : "提交预约，等待店员确认");
    if (auto) pushHist(appt, "confirm", "系统", "确认方式为自动确认");
    getState().appointments.push(appt);
    save();
    return { ok: true, appointment: appt };
  }

  function expireOverdue(silent) {
    var timeout = Number(getSettings().confirmTimeoutMinutes) * 60 * 1000;
    var changed = false;
    getState().appointments.forEach(function (a) {
      if (a.status !== "pending_confirm") return;
      var deadline = a.confirmDeadline || (new Date(a.createdAt).getTime() + timeout);
      if (now() > deadline) {
        a.status = "expired";
        a.expiredAt = todayISO() + "T" + toHHMM(new Date().getHours() * 60 + new Date().getMinutes()) + ":00";
        pushHist(a, "expire", "系统", "超过确认时限，档期已释放");
        changed = true;
      }
    });
    if (changed && !silent) save();
    else if (changed) save();
    return changed;
  }

  function mustStatus(appt, allowed) {
    if (!appt) return "找不到这张预约。";
    if (allowed.indexOf(appt.status) < 0) {
      return "当前状态是「" + (STATUS_LABEL[appt.status] || appt.status) + "」，不能进行该操作。";
    }
    return null;
  }

  function confirmAppointment(id, by) {
    var a = getAppointment(id);
    var err = mustStatus(a, ["pending_confirm"]);
    if (err) return { ok: false, reasons: [err] };
    var chk = checkConflict({
      staffId: a.staffId, chairId: a.chairId, date: a.date, start: a.start,
      duration: a.durationMinutes, bufferMinutes: a.bufferMinutes, excludeId: a.id
    });
    if (!chk.ok) return { ok: false, reasons: chk.reasons };
    a.status = "confirmed";
    a.confirmedAt = new Date().toISOString();
    pushHist(a, "confirm", by || "店员", "已确认预约");
    save();
    return { ok: true, appointment: a };
  }

  function cancelAppointment(id, by, reason) {
    var a = getAppointment(id);
    var err = mustStatus(a, ["pending_confirm", "confirmed"]);
    if (err) return { ok: false, reasons: [err] };
    a.status = "cancelled";
    a.cancelReason = reason || "";
    a.cancelledAt = new Date().toISOString();
    pushHist(a, "cancel", by || "顾客", reason ? ("已取消：" + reason) : "已取消，档期已释放");
    save();
    return { ok: true, appointment: a };
  }

  function arriveAppointment(id, by) {
    var a = getAppointment(id);
    var err = mustStatus(a, ["confirmed"]);
    if (err) return { ok: false, reasons: [err] };
    a.status = "arrived";
    a.arrivedAt = new Date().toISOString();
    pushHist(a, "arrive", by || "店员", "顾客已到店");
    save();
    return { ok: true, appointment: a };
  }

  function startService(id, by) {
    var a = getAppointment(id);
    var err = mustStatus(a, ["arrived", "confirmed"]);
    if (err) return { ok: false, reasons: [err] };
    if (a.status === "confirmed") {
      a.status = "arrived";
      a.arrivedAt = new Date().toISOString();
      pushHist(a, "arrive", by || "店员", "直接开始前记为已到店");
    }
    a.status = "in_service";
    a.startedAt = new Date().toISOString();
    pushHist(a, "start", by || "店员", "开始服务");
    save();
    return { ok: true, appointment: a };
  }

  function completeService(id, by) {
    var a = getAppointment(id);
    var err = mustStatus(a, ["in_service"]);
    if (err) return { ok: false, reasons: [err] };
    a.status = "pending_settle";
    a.completedAt = new Date().toISOString();
    pushHist(a, "complete", by || "店员", "服务完成，技师与椅位已释放，待结算");
    save();
    return { ok: true, appointment: a };
  }

  function applicableCards(customerId, serviceIds) {
    return getCards({ customerId: customerId, activeOnly: true }).filter(function (c) {
      return c.remaining > 0 && (c.applicableServiceIds || []).some(function (id) { return serviceIds.indexOf(id) >= 0; });
    });
  }

  function settleAppointment(id, opts) {
    opts = opts || {};
    var a = getAppointment(id);
    var err = mustStatus(a, ["pending_settle"]);
    if (err) return { ok: false, reasons: [err] };
    var method = opts.method || "cash";
    var deductTimes = 0;
    var covered = 0;
    var card = null;
    if (method === "card") {
      card = getCard(opts.cardId);
      if (!card || card.customerId !== a.customerId) return { ok: false, reasons: ["请选择该顾客名下的有效次卡。"] };
      if (card.status !== "active" || card.remaining <= 0) return { ok: false, reasons: ["这张次卡没有剩余次数。"] };
      var matchIds = a.serviceIds.filter(function (sid) { return (card.applicableServiceIds || []).indexOf(sid) >= 0; });
      if (!matchIds.length) return { ok: false, reasons: ["这张次卡不适用于本单里的项目。"] };
      deductTimes = Math.min(card.remaining, matchIds.length);
      if (deductTimes <= 0) return { ok: false, reasons: ["次卡余次不足。"] };
      card.remaining -= deductTimes;
      if (card.remaining <= 0) card.status = "used_up";
      covered = matchIds.slice(0, deductTimes).reduce(function (s, sid) {
        var svc = getService(sid);
        return s + (svc ? svc.price : 0);
      }, 0);
      getState().ledger.push({
        id: uid("ld"),
        cardId: card.id,
        customerId: a.customerId,
        appointmentId: a.id,
        delta: -deductTimes,
        remainingAfter: card.remaining,
        at: new Date().toISOString(),
        by: opts.by || "店员",
        text: "结算扣 " + deductTimes + " 次，余 " + card.remaining + " 次"
      });
      a.cardUsedId = card.id;
      a.cardDeductTimes = deductTimes;
    }
    var payAmount = Math.max(0, a.price - covered);
    if (method === "cash") payAmount = a.price;
    if (method === "card" && payAmount > 0 && opts.allowMixed !== false) {
      // 不足部分到店补差，仍算完成
    }
    a.status = "completed";
    a.settledAt = new Date().toISOString();
    a.settleMethod = method;
    a.settleAmount = method === "cash" ? a.price : payAmount;
    var label = method === "cash"
      ? ("到店现结 " + formatMoney(a.price) + "（演示，非真实收款）")
      : ("次卡扣 " + deductTimes + " 次" + (payAmount > 0 ? "，补差 " + formatMoney(payAmount) : "") + "（演示）");
    pushHist(a, "settle", opts.by || "店员", label);
    var serviceNames = resolveServices(a.serviceIds).map(function (s) { return s.name; }).join("、");
    getState().consumptions.push({
      id: uid("cs"),
      customerId: a.customerId,
      appointmentId: a.id,
      date: a.date,
      amount: a.settleAmount,
      method: method,
      methodLabel: label,
      serviceNames: serviceNames,
      staffId: a.staffId
    });
    maybeConvertReferral(a);
    save();
    return { ok: true, appointment: a };
  }

  function voidSettlement(id, by, reason) {
    var a = getAppointment(id);
    var err = mustStatus(a, ["pending_settle"]);
    if (err) return { ok: false, reasons: [err] };
    a.status = "voided";
    a.voidReason = reason || "";
    a.voidedAt = new Date().toISOString();
    pushHist(a, "void", by || "店员", reason ? ("作废待结算：" + reason) : "作废待结算");
    save();
    return { ok: true, appointment: a };
  }

  function maybeConvertReferral(appt) {
    var c = getCustomer(appt.customerId);
    if (!c || !c.referrerId) return;
    var existing = getState().referrals.filter(function (r) { return r.customerId === c.id && r.converted; });
    if (existing.length) return;
    var rec = findById(getState().referrals, null);
    var found = null;
    getState().referrals.forEach(function (r) { if (r.customerId === c.id) found = r; });
    if (!found) {
      found = { id: uid("rf"), customerId: c.id, referrerId: c.referrerId, source: c.source, converted: false };
      getState().referrals.push(found);
    }
    if (!found.converted) {
      found.converted = true;
      found.convertedAt = appt.date;
      found.appointmentId = appt.id;
    }
  }

  function purchaseCard(opts) {
    var product = findById(getState().cardProducts, opts.productId);
    var customer = getCustomer(opts.customerId);
    if (!product || !product.active) return { ok: false, reasons: ["次卡产品不可用。"] };
    if (!customer) return { ok: false, reasons: ["找不到顾客。"] };
    var card = {
      id: uid("card"),
      customerId: customer.id,
      productId: product.id,
      name: product.name,
      remaining: product.times,
      total: product.times,
      applicableServiceIds: product.applicableServiceIds.slice(),
      openedAt: new Date().toISOString(),
      status: "active"
    };
    getState().cards.push(card);
    getState().ledger.push({
      id: uid("ld"),
      cardId: card.id,
      customerId: customer.id,
      appointmentId: null,
      delta: product.times,
      remainingAfter: product.times,
      at: new Date().toISOString(),
      by: opts.by || "演示购卡",
      text: "开通「" + product.name + "」（演示，非真实付款），余 " + product.times + " 次"
    });
    if (!customer.isMember) customer.isMember = true;
    save();
    return { ok: true, card: card };
  }

  function redeemCardDirect(opts) {
    var card = getCard(opts.cardId);
    if (!card || card.status !== "active" || card.remaining <= 0) {
      return { ok: false, reasons: ["次卡不可核销，或没有剩余次数。"] };
    }
    var times = Number(opts.times || 1);
    if (times < 1 || times > card.remaining) return { ok: false, reasons: ["核销次数不正确。"] };
    card.remaining -= times;
    if (card.remaining <= 0) card.status = "used_up";
    getState().ledger.push({
      id: uid("ld"),
      cardId: card.id,
      customerId: card.customerId,
      appointmentId: opts.appointmentId || null,
      delta: -times,
      remainingAfter: card.remaining,
      at: new Date().toISOString(),
      by: opts.by || "店员",
      text: opts.text || ("直接核销 " + times + " 次，余 " + card.remaining + " 次")
    });
    save();
    return { ok: true, card: card };
  }

  function updateSettings(partial) {
    var s = getState().settings;
    if (partial.confirmMode && ["manual", "auto"].indexOf(partial.confirmMode) < 0) {
      return { ok: false, reasons: ["确认方式只能是店员确认或自动确认。"] };
    }
    if (partial.bufferMinutes != null) {
      var b = Number(partial.bufferMinutes);
      if (!(b >= 0 && b <= 15) || b !== Math.floor(b)) {
        return { ok: false, reasons: ["工位缓冲须为 0 至 15 分钟的整数。"] };
      }
    }
    if (partial.confirmTimeoutMinutes != null) {
      var t = Number(partial.confirmTimeoutMinutes);
      if (!(t >= 5 && t <= 120)) return { ok: false, reasons: ["确认时限建议在 5 至 120 分钟之间。"] };
    }
    if (partial.store) Object.assign(getState().store, partial.store);
    Object.keys(partial).forEach(function (k) {
      if (k === "store") return;
      if (partial[k] != null) s[k] = partial[k];
    });
    save();
    return { ok: true, settings: s, store: getState().store };
  }

  function upsertService(data) {
    var list = getState().services;
    var item = data.id ? findById(list, data.id) : null;
    if (!item) {
      item = Object.assign({ id: uid("svc"), active: true, tags: [] }, data);
      if (!data.id) item.id = uid("svc");
      list.push(item);
    } else {
      Object.assign(item, data);
    }
    save();
    return { ok: true, service: item };
  }

  function upsertStaff(data) {
    var list = getState().staff;
    var item = data.id ? findById(list, data.id) : null;
    if (!item) {
      item = Object.assign({ id: uid("st"), active: true, skills: [], schedule: defaultWeek(), avatar: "assets/avatar-lin.svg", title: "美甲师", bio: "" }, data);
      list.push(item);
    } else {
      Object.assign(item, data);
    }
    save();
    return { ok: true, staff: item };
  }

  function upsertChair(data) {
    var list = getState().chairs;
    var item = data.id ? findById(list, data.id) : null;
    if (!item) {
      item = Object.assign({ id: uid("ch"), active: true, note: "" }, data);
      list.push(item);
    } else Object.assign(item, data);
    save();
    return { ok: true, chair: item };
  }

  function upsertWork(data) {
    var list = getState().works;
    var item = data.id ? findById(list, data.id) : null;
    if (!item) {
      item = Object.assign({ id: uid("w"), published: true, featured: false }, data);
      list.push(item);
    } else Object.assign(item, data);
    save();
    return { ok: true, work: item };
  }

  function upsertCardProduct(data) {
    var list = getState().cardProducts;
    var item = data.id ? findById(list, data.id) : null;
    if (!item) {
      item = Object.assign({ id: uid("cp"), active: true, times: 5, price: 0, applicableServiceIds: [] }, data);
      list.push(item);
    } else Object.assign(item, data);
    save();
    return { ok: true, product: item };
  }

  function upsertCustomer(data) {
    var list = getState().customers;
    var item = data.id ? findById(list, data.id) : null;
    if (!item) {
      if (data.referrerId && data.referrerId === data.id) return { ok: false, reasons: ["不能推荐自己。"] };
      item = Object.assign({
        id: uid("cu"),
        isMember: false,
        source: data.source || "自行到店",
        referrerId: data.referrerId || null,
        sourceLocked: false,
        note: ""
      }, data);
      list.push(item);
      if (item.referrerId) {
        getState().referrals.push({
          id: uid("rf"),
          customerId: item.id,
          referrerId: item.referrerId,
          source: item.source,
          converted: false
        });
      }
    } else {
      if (data.referrerId && data.referrerId === item.id) return { ok: false, reasons: ["不能推荐自己。"] };
      if (item.sourceLocked) {
        var keep = { source: item.source, referrerId: item.referrerId, sourceLocked: true };
        Object.assign(item, data, keep);
      } else {
        Object.assign(item, data);
      }
    }
    save();
    return { ok: true, customer: item };
  }

  function setReferralSource(customerId, source, referrerId) {
    var c = getCustomer(customerId);
    if (!c) return { ok: false, reasons: ["找不到顾客。"] };
    if (c.sourceLocked) return { ok: false, reasons: ["首次来源已经锁定，不能再改。"] };
    if (referrerId && referrerId === customerId) return { ok: false, reasons: ["不能推荐自己。"] };
    c.source = source;
    c.referrerId = referrerId || null;
    c.sourceLocked = true;
    if (referrerId) {
      getState().referrals.push({
        id: uid("rf"),
        customerId: c.id,
        referrerId: referrerId,
        source: source,
        converted: false
      });
    }
    save();
    return { ok: true, customer: c };
  }

  function getReferralStats() {
    var list = getState().referrals;
    return {
      total: list.length,
      converted: list.filter(function (r) { return r.converted; }).length,
      items: list
    };
  }

  function getDashboardMetrics(today) {
    today = today || todayISO();
    var apptsToday = getAppointments({ date: today });
    var valid = apptsToday.filter(function (a) { return ["cancelled", "expired", "voided"].indexOf(a.status) < 0; });
    var arrivedLike = apptsToday.filter(function (a) {
      return ["arrived", "in_service", "pending_settle", "completed"].indexOf(a.status) >= 0;
    });
    var completed = apptsToday.filter(function (a) { return a.status === "completed"; });
    var revenue = completed.reduce(function (s, a) { return s + Number(a.settleAmount || 0); }, 0);
    var pendingConfirm = getAppointments({ status: "pending_confirm" });
    var pendingSettle = getAppointments({ status: "pending_settle" });
    var members = getCustomers().filter(function (c) { return c.isMember; }).length;
    var cardRemain = getCards({ activeOnly: true }).reduce(function (s, c) { return s + Number(c.remaining); }, 0);
    return [
      { key: "todayAppts", label: "今日预约", value: valid.length, hint: "不含已取消、已超时、已作废" },
      { key: "todayArrived", label: "今日已到店", value: arrivedLike.length, hint: "含服务中、待结算与今日已完成" },
      { key: "todayDone", label: "今日已完成", value: completed.length, hint: "今日已结算的预约" },
      { key: "todayRevenue", label: "今日营收", value: formatMoney(revenue), raw: revenue, hint: "仅统计今日已结算金额，演示数字" },
      { key: "pendingConfirm", label: "待确认", value: pendingConfirm.length, hint: "全部未过期的待确认预约" },
      { key: "pendingSettle", label: "待结算", value: pendingSettle.length, hint: "服务已完成、尚未核销" },
      { key: "members", label: "在籍会员", value: members, hint: "当前演示顾客中的会员人数" },
      { key: "cardTimes", label: "次卡余次", value: cardRemain, hint: "所有有效次卡的剩余次数合计" }
    ];
  }

  function serviceNamesOf(appt) {
    return resolveServices(appt.serviceIds).map(function (s) { return s.name; }).join("、");
  }

  function endTimeOf(appt) {
    return toHHMM(toMin(appt.start) + Number(appt.durationMinutes));
  }

  function lockEndOf(appt) {
    return toHHMM(occupyEnd(appt));
  }

  function remainingConfirmMs(appt) {
    if (!appt || appt.status !== "pending_confirm") return 0;
    var deadline = appt.confirmDeadline || (new Date(appt.createdAt).getTime() + Number(getSettings().confirmTimeoutMinutes) * 60 * 1000);
    return Math.max(0, deadline - now());
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    LOCK_STATUSES: LOCK_STATUSES,
    STATUS_LABEL: STATUS_LABEL,
    todayISO: todayISO,
    addDays: addDays,
    weekday: weekday,
    toMin: toMin,
    toHHMM: toHHMM,
    formatDateCN: formatDateCN,
    formatMoney: formatMoney,
    now: now,
    seed: seed,
    load: load,
    save: save,
    reset: reset,
    getState: getState,
    getStore: getStore,
    getSettings: getSettings,
    getSession: getSession,
    setSession: setSession,
    getServices: getServices,
    getService: getService,
    getStaffList: getStaffList,
    getStaff: getStaff,
    getChairs: getChairs,
    getChair: getChair,
    getWorks: getWorks,
    getWork: getWork,
    getRefs: getRefs,
    getRef: getRef,
    getCustomers: getCustomers,
    getCustomer: getCustomer,
    getCardProducts: getCardProducts,
    getCards: getCards,
    getCard: getCard,
    getLedger: getLedger,
    getConsumptions: getConsumptions,
    getAppointments: getAppointments,
    getAppointment: getAppointment,
    resolveServices: resolveServices,
    workingIntervals: workingIntervals,
    getOccupiedIntervals: getOccupiedIntervals,
    getEligibleStaff: getEligibleStaff,
    staffCanDo: staffCanDo,
    checkConflict: checkConflict,
    getAvailableStarts: getAvailableStarts,
    createAppointment: createAppointment,
    expireOverdue: expireOverdue,
    confirmAppointment: confirmAppointment,
    cancelAppointment: cancelAppointment,
    arriveAppointment: arriveAppointment,
    startService: startService,
    completeService: completeService,
    settleAppointment: settleAppointment,
    voidSettlement: voidSettlement,
    applicableCards: applicableCards,
    purchaseCard: purchaseCard,
    redeemCardDirect: redeemCardDirect,
    updateSettings: updateSettings,
    upsertService: upsertService,
    upsertStaff: upsertStaff,
    upsertChair: upsertChair,
    upsertWork: upsertWork,
    upsertCardProduct: upsertCardProduct,
    upsertCustomer: upsertCustomer,
    setReferralSource: setReferralSource,
    getReferralStats: getReferralStats,
    getDashboardMetrics: getDashboardMetrics,
    serviceNamesOf: serviceNamesOf,
    endTimeOf: endTimeOf,
    lockEndOf: lockEndOf,
    remainingConfirmMs: remainingConfirmMs,
    defaultWeek: defaultWeek,
    sumDurations: sumDurations,
    sumPrice: sumPrice
  };
});
