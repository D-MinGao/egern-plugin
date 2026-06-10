/**
 * ==========================================
 * 📌 DeepSeek API 用量监控小组件
 * ✨ 【主要功能】
 * • 双卡片极简布局：总余额 + Tokens
 * • 六端尺寸适配
 * • 自适应浅色/深色模式
 *
 * 🔧 【环境变量】
 * DEEPSEEK_API_KEY — DeepSeek API Key（必填）
 *
 * ⏱️ 更新时间 2026.06.11
 * ==========================================
 */

export default async function (ctx) {
  const env    = ctx.env || {};
  const apiKey = env.DEEPSEEK_API_KEY || env.apiKey;

  const family   = (ctx.widgetFamily || 'systemMedium').toLowerCase();
  const isSmall  = family.includes('small');
  const isLarge  = family.includes('large');

  const now = new Date();
  const P   = n => String(n).padStart(2, "0");
  const updateTimeStr = `${P(now.getMonth()+1)}.${P(now.getDate())} ${P(now.getHours())}:${P(now.getMinutes())}`;

  // ── 色彩 ────────────────────────────────────────────────────────────────
  const C = {
    bg:      [{ light: '#FAFAFA', dark: '#1C1C1E' }, { light: '#F2F2F7', dark: '#111113' }],
    card:    { light: '#FFFFFF',   dark: '#2C2C2E' },
    main:    { light: '#1C1C1E',   dark: '#F2F2F7' },
    muted:   { light: '#8E8E93',   dark: '#636366' },
    accent:  { light: '#4F46E5',   dark: '#818CF8' },
    green:   { light: '#1E7E44',   dark: '#30D158' },
    red:     { light: '#C0392B',   dark: '#FF453A' },
    divider: { light: '#E5E5EA',   dark: '#38383A' }
  };

  const backgroundGradient = {
    type: 'linear', colors: C.bg,
    startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 }
  };

  // ── UI 工厂 ────────────────────────────────────────────────────────────
  const mkText = (text, size, weight, color, opts = {}) => {
    const { family: fontFamily, ...restOpts } = opts;
    return { type: "text", text: String(text ?? ""), font: { size, weight, ...(fontFamily ? { family: fontFamily } : {}) }, textColor: color, ...restOpts };
  };
  const mkRow    = (children, gap = 4, opts = {}) => ({ type: "stack", direction: "row", alignItems: "center", gap, children, ...opts });
  const mkIcon   = (src, color, size = 13) => ({ type: "image", src: `sf-symbol:${src}`, color, width: size, height: size });
  const mkSpacer = (length) => length != null ? { type: "spacer", length } : { type: "spacer" };
  const mkDivider = () => ({ type: "stack", height: 0.5, backgroundColor: C.divider, borderRadius: 1, children: [] });

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

  // ── 无 API Key ─────────────────────────────────────────────────────────
  if (!apiKey) {
    return {
      type: "widget", padding: 12, backgroundGradient,
      children: [
        mkIcon("key.fill", { light: '#B07C1A', dark: '#D4A02A' }, 20), mkSpacer(8),
        mkText("请设置 DEEPSEEK_API_KEY", 11, "medium", { light: '#B07C1A', dark: '#D4A02A' }, { maxLines: 2, minScale: 0.7 })
      ]
    };
  }

  // ── 数据获取 ──────────────────────────────────────────────────────────
  let balance = null;
  let tokens  = null;
  let loadErr = null;

  try {
    const headers = { 'Authorization': `Bearer ${apiKey}` };

    const [bResp, tResp] = await Promise.all([
      ctx.http.get('https://api.deepseek.com/user/balance', { headers, timeout: 15000 }).catch(e => ({ _err: e })),
      ctx.http.get('https://api.deepseek.com/user/usage',   { headers, timeout: 15000 }).catch(e => ({ _err: e })),
    ]);

    if (!bResp._err && bResp.status === 200) {
      balance = parseBalance(await bResp.json());
    }
    if (!tResp._err && tResp.status === 200) {
      tokens = parseTokens(await tResp.json());
    }

    if (!balance && tokens == null) {
      loadErr = bResp._err?.message || tResp._err?.message || `HTTP ${bResp.status || tResp.status || 'error'}`;
    }
  } catch (e) {
    loadErr = e.message || String(e);
  }

  if (!balance && tokens == null && loadErr) {
    return {
      type: "widget", padding: 12, backgroundGradient,
      children: [
        mkIcon("exclamationmark.triangle.fill", { light: '#B07C1A', dark: '#D4A02A' }, 20), mkSpacer(6),
        mkText("请求失败", 12, "bold", C.red), mkSpacer(2),
        mkText(loadErr, 10, "medium", C.muted, { maxLines: 2, minScale: 0.6 })
      ]
    };
  }

  // ── 双卡片数据 ────────────────────────────────────────────────────────
  const currency = balance ? (balance.currency || 'CNY') : 'CNY';
  const apiOk    = balance ? balance.available : true;

  const CARDS = [
    { label: "总余额", val: balance ? fmtCurrency(balance.totalBalance, currency) : "--", color: C.main },
    { label: "Tokens", val: tokens != null ? fmtTokens(tokens)                 : "--", color: C.accent },
  ];

  // ── 视图分发 ──────────────────────────────────────────────────────────
  if (isSmall)  return buildSmall();
  if (isLarge)  return buildLarge();
  if (family.includes('rectangular')) return buildRectangular();
  if (family.includes('circular'))    return buildCircular();
  if (family.includes('inline'))      return buildInline();
  return buildMedium();

  // ============================================================
  // systemSmall
  // ============================================================
  function buildSmall() {
    const cfg = { radius: 12, padding: [8, 4, 8, 4], labelFz: 11, labelWeight: "bold", valFz: 17, innerGap: 4 };
    return {
      type: "widget", padding: 12, backgroundGradient,
      children: [
        mkRow([mkIcon("brain.head.profile", C.accent, 13), mkSpacer(4), mkText("DeepSeek", 13, "heavy", C.main, { maxLines: 1, minScale: 0.8 }), mkSpacer()], 0),
        mkSpacer(12),
        mkRow(CARDS.map(item => buildCard(item, cfg)), 10, { flex: 1 }),
        mkSpacer(12),
        mkRow([mkSpacer(), mkIcon(apiOk ? "checkmark.circle.fill" : "xmark.circle.fill", apiOk ? C.green : C.red, 9), mkSpacer(3), mkText(apiOk ? "可用" : "异常", 9, "bold", apiOk ? C.green : C.red)], 0)
      ]
    };
  }

  // ============================================================
  // systemMedium
  // ============================================================
  function buildMedium() {
    const cfg = { radius: 14, padding: [14, 8, 14, 8], labelFz: 12, labelWeight: "bold", valFz: 22, innerGap: 6 };
    return {
      type: "widget", padding: 14, backgroundGradient,
      children: [
        mkRow([
          mkIcon("brain.head.profile", C.accent, 16), mkSpacer(2),
          mkText("DeepSeek", 15, "heavy", C.main), mkSpacer(),
          mkIcon(apiOk ? "checkmark.circle.fill" : "xmark.circle.fill", apiOk ? C.green : C.red, 11),
          mkText(apiOk ? "可用" : "异常", 10, "bold", apiOk ? C.green : C.red)
        ], 0),
        mkSpacer(14),
        mkRow(CARDS.map(item => buildCard(item, cfg)), 10),
        mkSpacer(14),
        mkDivider(),
        mkSpacer(8),
        mkRow([mkIcon("arrow.triangle.2.circlepath", C.muted, 11), mkSpacer(4), mkText(updateTimeStr, 9, "bold", C.muted, { family: "Menlo" })], 0)
      ]
    };
  }

  // ============================================================
  // systemLarge
  // ============================================================
  function buildLarge() {
    const cfg = { radius: 16, padding: [0, 0, 0, 0], labelFz: 16, labelWeight: "heavy", valFz: 32, innerGap: 10 };
    return {
      type: "widget", padding: 18, backgroundGradient,
      children: [
        mkRow([
          mkIcon("brain.head.profile", C.accent, 18), mkSpacer(4),
          mkText("DeepSeek", 17, "heavy", C.main), mkSpacer(),
          mkIcon(apiOk ? "checkmark.circle.fill" : "xmark.circle.fill", apiOk ? C.green : C.red, 14),
          mkText(apiOk ? "API 可用" : "API 异常", 12, "medium", apiOk ? C.green : C.red)
        ], 0),
        mkSpacer(20),
        mkRow(CARDS.map(item => buildCard(item, cfg)), 16, { flex: 1 }),
        mkSpacer(20),
        mkDivider(),
        mkSpacer(12),
        mkRow([mkIcon("arrow.triangle.2.circlepath", C.muted, 13), mkSpacer(4), mkText(updateTimeStr, 11, "bold", C.muted, { family: "Menlo" })], 0)
      ]
    };
  }

  // ============================================================
  // accessoryRectangular
  // ============================================================
  function buildRectangular() {
    const balanceText = balance ? fmtCurrency(balance.totalBalance, currency) : "--";
    const tokenText   = tokens != null ? fmtTokens(tokens) : "--";
    return {
      type: "widget", padding: [10, 14], backgroundGradient,
      children: [
        mkRow([mkIcon("brain.head.profile", C.accent, 12), mkSpacer(4), mkText(`DeepSeek  ${balanceText}`, 12, "semibold", C.main, { flex: 1, maxLines: 1, minScale: 0.6 })], 0),
        mkSpacer(2),
        mkText(`${tokenText} tokens`, 10, "medium", C.muted)
      ]
    };
  }

  // ============================================================
  // accessoryCircular
  // ============================================================
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

  // ============================================================
  // accessoryInline
  // ============================================================
  function buildInline() {
    const parts = [];
    if (balance) parts.push(fmtCurrency(balance.totalBalance, currency));
    if (tokens != null) parts.push(`${fmtTokens(tokens)} tokens`);
    const text = parts.length > 0 ? parts.join(" · ") : "DeepSeek";
    return { type: "widget", children: [mkText(text, 12, "medium", C.main, { textAlign: "center", minScale: 0.5 })] };
  }
}

// ============================================================
// 模块级辅助函数
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

function parseTokens(data) {
  if (!data) return null;
  if (data.total_tokens != null) return data.total_tokens;
  if (data.total_usage  != null) return data.total_usage;
  return null;
}

function fmtTokens(n) {
  if (n == null) return null;
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B';
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)         return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function fmtCurrency(amount, currency) {
  const sym = currency === 'USD' ? '$' : currency === 'CNY' ? '¥' : currency + ' ';
  return `${sym}${amount.toFixed(2)}`;
}
