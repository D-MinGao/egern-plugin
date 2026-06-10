/**
 * ==========================================
 * 📌 DeepSeek 余额监控小组件
 * ✨ 纯余额卡片，干净可靠，无无效 API 调用
 *
 * 🔧 环境变量：DEEPSEEK_API_KEY
 * ⏱️ 更新时间 2026.06.11
 * ==========================================
 */

export default async function (ctx) {
  const apiKey = (ctx.env || {}).DEEPSEEK_API_KEY;

  const family  = (ctx.widgetFamily || 'systemMedium').toLowerCase();
  const isSmall = family.includes('small');
  const isLarge = family.includes('large');

  const now = new Date();
  const P   = n => String(n).padStart(2, "0");
  const time = `${P(now.getMonth()+1)}.${P(now.getDate())} ${P(now.getHours())}:${P(now.getMinutes())}`;

  // ── 色彩 ──────────────────────────────────────────────────────────────
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
  const GRAD = { type:'linear', colors:C.bg, startPoint:{x:0,y:0}, endPoint:{x:1,y:1} };

  // ── UI 工厂 ──────────────────────────────────────────────────────────
  const T = (t,s,w,c,o={}) => { const { family:f, ...r } = o; return { type:"text", text:String(t??""), font:{size:s,weight:w,...(f?{family:f}:{})}, textColor:c, ...r }; };
  const R = (ch,g=4,o={})  => ({ type:"stack", direction:"row", alignItems:"center", gap:g, children:ch, ...o });
  const I = (src,c,sz=13)  => ({ type:"image", src:`sf-symbol:${src}`, color:c, width:sz, height:sz });
  const S = (len)          => len!=null ? { type:"spacer", length:len } : { type:"spacer" };
  const D = ()             => ({ type:"stack", height:0.5, backgroundColor:C.divider, borderRadius:1, children:[] });

  // ── 无 Key ───────────────────────────────────────────────────────────
  if (!apiKey) {
    return { type:"widget", padding:12, backgroundGradient:GRAD, children:[
      I("key.fill",{light:'#B07C1A',dark:'#D4A02A'},20), S(8),
      T("请设置 DEEPSEEK_API_KEY",11,"medium",{light:'#B07C1A',dark:'#D4A02A'},{maxLines:2,minScale:0.7})
    ]};
  }

  // ── 获取余额 ─────────────────────────────────────────────────────────
  let balance = null, err = null;
  try {
    const resp = await ctx.http.get('https://api.deepseek.com/user/balance', {
      headers: { Authorization: `Bearer ${apiKey}` }, timeout: 15000,
    });
    if (resp.status === 200) balance = parseBalance(await resp.json());
    else err = `HTTP ${resp.status}`;
  } catch (e) { err = e.message || String(e); }

  if (!balance && err) {
    return { type:"widget", padding:12, backgroundGradient:GRAD, children:[
      I("exclamationmark.triangle.fill",{light:'#B07C1A',dark:'#D4A02A'},20), S(6),
      T("请求失败",12,"bold",C.red), S(2),
      T(err,10,"medium",C.muted,{maxLines:2,minScale:0.6})
    ]};
  }

  const cur = balance ? (balance.currency || 'CNY') : 'CNY';
  const ok  = balance ? balance.available : false;

  const balVal = balance ? fmtCurrency(balance.totalBalance, cur) : "--";

  // ── 分发 ─────────────────────────────────────────────────────────────
  if (isSmall) return buildSmall();
  if (isLarge) return buildLarge();
  if (family.includes('rectangular')) return buildRect();
  if (family.includes('circular'))    return buildCirc();
  if (family.includes('inline'))      return buildInline();
  return buildMedium();

  // ============================================================
  function buildSmall() {
    return { type:"widget", padding:14, backgroundGradient:GRAD, children:[
      R([I("brain.head.profile",C.accent,12), S(3), T("DeepSeek",11,"heavy",C.main,{maxLines:1,minScale:0.8}), S()], 0),
      S(),
      T(balVal, 28, "heavy", C.main, { textAlign:"center", minScale:0.4 }),
      S(4),
      T("余额", 11, "medium", C.muted, { textAlign:"center" }),
      S(),
      D(), S(6),
      R([S(), I(ok?"checkmark.circle.fill":"xmark.circle.fill",ok?C.green:C.red,9), S(3), T(ok?"API可用":"异常",9,"bold",ok?C.green:C.red)], 0)
    ]};
  }

  function buildMedium() {
    return { type:"widget", padding:16, backgroundGradient:GRAD, children:[
      R([I("brain.head.profile",C.accent,16), S(3), T("DeepSeek",16,"heavy",C.main), S(), I(ok?"checkmark.circle.fill":"xmark.circle.fill",ok?C.green:C.red,12), T(ok?"可用":"异常",10,"bold",ok?C.green:C.red)], 0),
      S(16),
      T(balVal, 40, "heavy", C.main, { textAlign:"center", minScale:0.3 }),
      S(4),
      T("当前余额", 13, "medium", C.muted, { textAlign:"center" }),
      S(16),
      D(), S(8),
      R([I("arrow.triangle.2.circlepath",C.muted,11), S(4), T(time,9,"bold",C.muted,{family:"Menlo"})], 0)
    ]};
  }

  function buildLarge() {
    return { type:"widget", padding:20, backgroundGradient:GRAD, children:[
      R([I("brain.head.profile",C.accent,20), S(4), T("DeepSeek 余额",18,"heavy",C.main), S(), I(ok?"checkmark.circle.fill":"xmark.circle.fill",ok?C.green:C.red,16), T(ok?"API 可用":"API 异常",12,"medium",ok?C.green:C.red)], 0),
      S(),
      T(balVal, 56, "heavy", C.main, { textAlign:"center", minScale:0.25 }),
      S(6),
      T("当前余额", 16, "medium", C.muted, { textAlign:"center" }),
      S(),
      D(), S(12),
      R([I("arrow.triangle.2.circlepath",C.muted,13), S(4), T(time,11,"bold",C.muted,{family:"Menlo"})], 0)
    ]};
  }

  function buildRect() {
    const t = balance ? fmtCurrency(balance.totalBalance, cur) : "--";
    return { type:"widget", padding:[10,14], backgroundGradient:GRAD, children:[
      R([I("brain.head.profile",C.accent,12), S(4), T(`DeepSeek  ${t}`,12,"semibold",C.main,{flex:1,maxLines:1,minScale:0.6})], 0),
      S(2), T(ok?"API 可用":"API 异常",10,"medium",ok?C.green:C.red)
    ]};
  }

  function buildCirc() {
    return { type:"widget", padding:8, backgroundGradient:GRAD, children:[
      I("brain.head.profile",C.accent,16), S(2),
      T(balance?fmtCurrency(balance.totalBalance,cur):"--",9,"bold",C.main,{textAlign:"center",minScale:0.5})
    ]};
  }

  function buildInline() {
    const t = balance ? `${fmtCurrency(balance.totalBalance, cur)} · ${ok?"可用":"异常"}` : "DeepSeek";
    return { type:"widget", children:[ T(t,12,"medium",C.main,{textAlign:"center",minScale:0.5}) ]};
  }
}

// ============================================================
function parseBalance(data) {
  if (!data) return null;
  if (data.balance_infos && Array.isArray(data.balance_infos)) {
    let total=0, topped=0, granted=0, cur='CNY';
    for (const i of data.balance_infos) {
      total+=parseFloat(i.total_balance)||0; topped+=parseFloat(i.topped_up_balance)||0; granted+=parseFloat(i.granted_balance)||0; cur=i.currency||cur;
    }
    return { available:data.is_available!==false, totalBalance:total, toppedUp:topped, granted, currency:cur };
  }
  if (data.total_balance !== undefined) {
    return { available:data.is_available!==false, totalBalance:parseFloat(data.total_balance)||0, toppedUp:parseFloat(data.topped_up_balance)||0, granted:parseFloat(data.granted_balance)||0, currency:data.currency||'CNY' };
  }
  return null;
}

function fmtCurrency(amount, currency) {
  const sym = currency==='USD'?'$':currency==='CNY'?'¥':currency+' ';
  return `${sym}${amount.toFixed(2)}`;
}
