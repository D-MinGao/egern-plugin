/**
 * ==========================================
 * 📌 DeepSeek API 用量监控小组件
 * ✨ 【主要功能】
 * • 六端尺寸完美适配：
 *   - systemSmall         ：2×2 四宫格（总余额/充值/赠送/已消费）
 *   - systemMedium        ：1×4 横排卡片 + 分隔线 + 更新时间
 *   - systemLarge         ：放大四宫格 + 消费统计
 *   - accessoryRectangular：锁屏单行余额+已消费
 *   - accessoryCircular   ：锁屏圆形图标 + 余额
 *   - accessoryInline     ：锁屏内联文本
 * • 实时余额精准拉取：充值/赠送/总余额/已消费，多币种自适应
 * • 已消费智能推算 = 充值 + 赠送 - 当前余额
 * • API 状态可视化：绿色对勾/红色叉号
 * • 自适应浅色/深色模式，iOS 系统外观自动切换
 *
 * 🔧 【环境变量】
 * DEEPSEEK_API_KEY  — DeepSeek API Key（必填）
 *
 * ⏱️ 更新时间 2026.06.11
 * ==========================================
 */

export default async function (ctx) {
  // ── 基础环境与配置 ──────────────────────────────────────────────────────
  const env    = ctx.env || {};
  const apiKey = env.DEEPSEEK_API_KEY || env.apiKey;

  const family   = (ctx.widgetFamily || 'systemMedium').toLowerCase();
  const isSmall  = family.includes('small');
  const isLarge  = family.includes('large');

  const now = new Date();
  const P   = n => String(n).padStart(2, "0");
  const updateTimeStr = `${P(now.getMonth()+1)}.${P(now.getDate())} ${P(now.getHours())}:${P(now.getMinutes())}`;

  // ── 统一色彩令牌系统（自适应浅色/深色）─────────────────────────────────
  const C = {
    bg:      [{ light: '#FAFAFA', dark: '#1C1C1E' }, { light: '#F2F2F7', dark: '#111113' }],
    card:    { light: '#FFFFFF',   dark: '#2C2C2E' },
    main:    { light: '#1C1C1E',   dark: '#F2F2F7' },
    muted:   { light: '#8E8E93',   dark: '#636366' },
    accent:  { light: '#4F46E5',   dark: '#818CF8' },
    green:   { light: '#1E7E44',   dark: '#30D158' },
    yellow:  { light: '#B07C1A',   dark: '#D4A02A' },
    red:     { light: '#C0392B',   dark: '#FF453A' },
    divider: { light: '#E5E5EA',   dark: '#38383A' }
  };

  const backgroundGradient = {
    type: 'linear', colors: C.bg,
    startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 }
  };

  // ── UI 构建器工厂 ──────────────────────────────────────────────────────
  const mkText = (text, size, weight, color, opts = {}) => {
    const { family: fontFamily, ...restOpts } = opts;
    return {
      type: "text",
      text: String(text ?? ""),
      font: { size, weight, ...(fontFamily ? { family: fontFamily } : {}) },
      textColor: color,
      ...restOpts
    };
  };
  const mkRow    = (children, gap = 4, opts = {}) => ({ type: "stack", direction: "row", alignItems: "center", gap, children, ...opts });
  const mkCol    = (children, gap = 4, opts = {}) => ({ type: "stack", direction: "column", alignItems: "center", gap, children, ...opts });
  const mkIcon   = (src, color, size = 13) => ({ type: "image", src: `sf-symbol:${src}`, color, width: size, height: size });
  const mkSpacer = (length) => length != null ? { type: "spacer", length } : { type: "spacer" };
  const mkDivider = () => ({ type: "stack", height: 0.5, backgroundColor: C.divider, borderRadius: 1, children: [] });

  // ── 卡片构建工厂（参数化不同尺寸）─────────────────────────────────────
  const buildCard = (item, cfg) => ({
    type: "stack", direction: "column", alignItems: "center",
    flex: 1, backgroundColor: C.card, borderRadius: cfg.radius, padding: cfg.padding,
    children: [
      mkSpacer(),
      mkText(item.label, cfg.labelFz, cfg.labelWeight, item.color, { maxLines: 1, minScale: 0.7 }),
      mkSpacer(cfg.innerGap),
      mkText(item.val, cfg.valFz, "heavy", C.main, { maxLines: 1, minScale: 0.6 }),
      mkSpacer()
    ]
  });

  // ── 无 API Key 提示 ────────────────────────────────────────────────────
  if (!apiKey) {
    return {
      type: "widget", padding: 12, backgroundGradient,
      children: [
        mkIcon("key.fill", C.yellow, 20), mkSpacer(8),
        mkText("请设置 DEEPSEEK_API_KEY", 11, "medium", C.yellow, { maxLines: 2, minScale: 0.7 })
      ]
    };
  }

  // ── 网络数据获取（仅余额 API；用量由余额推算）────────────────────────
  let balance = null;
  let loadErr = null;

  try {
    const resp = await ctx.http.get('https://api.deepseek.com/user/balance', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      timeout: 15000,
    });

    if (resp.status === 200) {
      balance = parseBalance(await resp.json());
    } else {
      loadErr = `HTTP ${resp.status}`;
    }
  } catch (e) {
    loadErr = e.message || String(e);
  }

  // ── 加载失败时的错误视图 ──────────────────────────────────────────────
  if (!balance && loadErr) {
    return {
      type: "widget", padding: 12, backgroundGradient,
      children: [
        mkIcon("exclamationmark.triangle.fill", C.yellow, 20), mkSpacer(6),
        mkText("请求失败", 12, "bold", C.red), mkSpacer(2),
        mkText(loadErr, 10, "medium", C.muted, { maxLines: 2, minScale: 0.6 })
      ]
    };
  }

  // ── 构建数据项列表 ─────────────────────────────────────────────────────
  const currency = balance ? (balance.currency || 'CNY') : 'CNY';
  const apiAvailable = balance ? balance.available : false;

  // 已消费 = 充值总额 + 赠送总额 - 当前余额
  const spent = balance
    ? Math.max(0, balance.toppedUp + balance.granted - balance.totalBalance)
    : 0;

  // 安全取值：balance 存在且字段有效才显示数值，否则显示 "--"
  const safeVal = (val, fmt) => (val != null ? fmt(val) : "--");

  const BALANCE_ITEMS = [
    { label: "总余额", key: "total", val: safeVal(balance?.totalBalance, v => fmtCurrency(v, currency)), color: C.main },
    { label: "充值",   key: "topup", val: safeVal(balance?.toppedUp,     v => fmtCurrency(v, currency)), color: C.muted },
    { label: "赠送",   key: "grant", val: safeVal(balance?.granted,      v => fmtCurrency(v, currency)), color: C.muted },
    { label: "已消费", key: "spent", val: balance ? fmtCurrency(spent, currency) : "--", color: C.accent },
  ];

  // ── 视图分发 ────────────────────────────────────────────────────────────
  if (isSmall)  return buildSmall();
  if (isLarge)  return buildLarge();

  if (family.includes('rectangular')) return buildRectangular();
  if (family.includes('circular'))    return buildCircular();
  if (family.includes('inline'))      return buildInline();

  // 默认: systemMedium
  return buildMedium();

  // ============================================================
  // 各尺寸渲染函数（闭包内，可直接访问 C, mkText 等）
  // ============================================================

  // ── systemSmall — 2×2 四宫格 ──────────────────────────────────────────
  function buildSmall() {
    const cardCfg = { radius: 10, padding: [4, 2, 4, 2], labelFz: 10, labelWeight: "bold", valFz: 15, innerGap: 3 };
    return {
      type: "widget", padding: 12, url: "https://platform.deepseek.com/", backgroundGradient,
      children: [
        mkRow([
          mkIcon("brain.head.profile", C.accent, 13), mkSpacer(4),
          mkText("DeepSeek", 13, "heavy", C.main, { maxLines: 1, minScale: 0.8 }), mkSpacer()
        ], 0),
        mkSpacer(10),
        { type: "stack", direction: "column", gap: 8, flex: 1, children: [
          mkRow(BALANCE_ITEMS.slice(0, 2).map(item => buildCard(item, cardCfg)), 8, { flex: 1 }),
          mkRow(BALANCE_ITEMS.slice(2, 4).map(item => buildCard(item, cardCfg)), 8, { flex: 1 })
        ]},
        mkSpacer(10),
        mkRow([
          mkSpacer(), mkIcon(apiAvailable ? "checkmark.circle.fill" : "xmark.circle.fill", apiAvailable ? C.green : C.red, 9), mkSpacer(3),
          mkText(apiAvailable ? "API 可用" : "API 不可用", 9, "bold", apiAvailable ? C.green : C.red)
        ], 0)
      ]
    };
  }

  // ── systemMedium — 1×4 横排卡片 + 详情 ──────────────────────────────────
  function buildMedium() {
    const cardCfg = { radius: 13, padding: [10, 4, 10, 4], labelFz: 11, labelWeight: "bold", valFz: 18, innerGap: 5 };
    return {
      type: "widget", padding: 12, url: "https://platform.deepseek.com/", backgroundGradient,
      children: [
        mkRow([
          mkIcon("brain.head.profile", C.accent, 16), mkSpacer(2),
          mkText("DeepSeek API 用量", 15, "heavy", C.main), mkSpacer(),
          mkRow([
            mkIcon(apiAvailable ? "checkmark.circle.fill" : "xmark.circle.fill", apiAvailable ? C.green : C.red, 11),
            mkSpacer(2),
            mkText(apiAvailable ? "可用" : "不可用", 10, "bold", apiAvailable ? C.green : C.red)
          ], 2)
        ], 0),

        mkSpacer(10),
        mkRow(BALANCE_ITEMS.map(item => buildCard(item, cardCfg)), 6),
        mkSpacer(10),
        mkDivider(),
        mkSpacer(7),

        mkRow([
          mkRow([
            mkIcon("arrow.triangle.2.circlepath", C.muted, 11),
            mkText(updateTimeStr, 9, "bold", C.muted, { family: "Menlo" })
          ], 4),
          mkSpacer(),
          mkRow([
            mkText("已消费", 10, "medium", C.muted),
            mkText(fmtCurrency(spent, currency), 10, "bold", C.accent)
          ], 2)
        ], 0)
      ]
    };
  }

  // ── systemLarge — 沉浸式大号布局 ──────────────────────────────────────
  function buildLarge() {
    const cardCfg = { radius: 16, padding: [0, 0, 0, 0], labelFz: 16, labelWeight: "heavy", valFz: 28, innerGap: 10 };
    return {
      type: "widget", padding: 16, url: "https://platform.deepseek.com/", backgroundGradient,
      children: [
        mkRow([
          mkIcon("brain.head.profile", C.accent, 18), mkSpacer(4),
          mkText("DeepSeek API 用量监控", 17, "heavy", C.main), mkSpacer(),
          mkRow([
            mkIcon(apiAvailable ? "checkmark.circle.fill" : "xmark.circle.fill", apiAvailable ? C.green : C.red, 14),
            mkSpacer(3),
            mkText(apiAvailable ? "API 可用" : "API 不可用", 12, "medium", apiAvailable ? C.green : C.red)
          ], 2)
        ], 0),

        mkSpacer(16),
        { type: "stack", direction: "column", gap: 12, flex: 1, children: [
          mkRow(BALANCE_ITEMS.slice(0, 2).map(item => buildCard(item, cardCfg)), 12, { flex: 1 }),
          mkRow(BALANCE_ITEMS.slice(2, 4).map(item => buildCard(item, cardCfg)), 12, { flex: 1 })
        ]},
        mkSpacer(16),
        mkDivider(),
        mkSpacer(12),

        mkRow([
          mkRow([
            mkIcon("arrow.triangle.2.circlepath", C.muted, 13),
            mkSpacer(4),
            mkText(updateTimeStr, 11, "bold", C.muted, { family: "Menlo" })
          ], 0),
          mkSpacer(),
          mkRow([
            mkText("已消费: ", 12, "medium", C.muted),
            mkText(fmtCurrency(spent, currency), 12, "bold", C.accent)
          ], 2)
        ], 0)
      ]
    };
  }

  // ── accessoryRectangular — 锁屏矩形 ───────────────────────────────────
  function buildRectangular() {
    const primaryText = balance ? fmtCurrency(balance.totalBalance, currency) : "--";
    const spentText   = balance ? `已消费 ${fmtCurrency(spent, currency)}` : "";
    return {
      type: "widget", padding: [10, 14], backgroundGradient,
      children: [
        mkRow([
          mkIcon("brain.head.profile", C.accent, 12), mkSpacer(4),
          mkText(`DeepSeek  ${primaryText}`, 12, "semibold", C.main, { flex: 1, maxLines: 1, minScale: 0.6 })
        ], 0),
        spentText ? [mkSpacer(2), mkText(spentText, 10, "medium", C.muted)] : []
      ].flat()
    };
  }

  // ── accessoryCircular — 锁屏圆形 ──────────────────────────────────────
  function buildCircular() {
    const text = balance ? fmtCurrency(balance.totalBalance, currency) : "--";
    return {
      type: "widget", padding: 8, backgroundGradient,
      children: [
        mkIcon("brain.head.profile", C.accent, 16),
        mkSpacer(2),
        mkText(text, 9, "bold", C.main, { textAlign: "center", minScale: 0.5 })
      ]
    };
  }

  // ── accessoryInline — 锁屏内联 ────────────────────────────────────────
  function buildInline() {
    const parts = [];
    if (balance) {
      parts.push(fmtCurrency(balance.totalBalance, currency));
      parts.push(`已消费 ${fmtCurrency(spent, currency)}`);
    }
    const text = parts.length > 0 ? parts.join(" · ") : "DeepSeek";
    return {
      type: "widget",
      children: [
        mkText(text, 12, "medium", C.main, { textAlign: "center", minScale: 0.5 })
      ]
    };
  }

}

// ============================================================
// 辅助函数（模块级别）
// ============================================================

function parseBalance(data) {
  if (!data) return null;

  if (data.balance_infos && Array.isArray(data.balance_infos)) {
    let total = 0, topped = 0, granted = 0, currency = 'CNY';
    for (const info of data.balance_infos) {
      total   += parseFloat(info.total_balance)   || 0;
      topped  += parseFloat(info.topped_up_balance) || 0;
      granted += parseFloat(info.granted_balance)  || 0;
      currency = info.currency || currency;
    }
    return { available: data.is_available !== false, totalBalance: total, toppedUp: topped, granted, currency };
  }

  if (data.total_balance !== undefined) {
    return {
      available:    data.is_available !== false,
      totalBalance: parseFloat(data.total_balance)   || 0,
      toppedUp:     parseFloat(data.topped_up_balance) || 0,
      granted:      parseFloat(data.granted_balance)  || 0,
      currency:     data.currency || 'CNY',
    };
  }
  return null;
}

function fmtCurrency(amount, currency) {
  const sym = currency === 'USD' ? '$' : currency === 'CNY' ? '¥' : currency + ' ';
  return `${sym}${amount.toFixed(2)}`;
}
