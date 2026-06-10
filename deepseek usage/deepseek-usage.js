/**
 * DeepSeek API 用量监控小组件
 *
 * 环境变量：
 *   DEEPSEEK_API_KEY  — DeepSeek API Key（必填）
 *   REFRESH_INTERVAL  — 刷新间隔（毫秒），默认 600000（10分钟）
 *
 * 支持的 widgetFamily：
 *   systemSmall / systemMedium / systemLarge / accessoryRectangular / accessoryCircular / accessoryInline
 */

export default async function(ctx) {
  const apiKey = ctx.env.DEEPSEEK_API_KEY;

  // 无 API Key 时显示提示
  if (!apiKey) {
    return buildErrorWidget('请设置 DEEPSEEK_API_KEY');
  }

  try {
    // 并行请求余额和使用量
    const [balanceResp, usageResp] = await Promise.allSettled([
      ctx.http.get('https://api.deepseek.com/user/balance', {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        timeout: 15000,
      }),
      ctx.http.get('https://api.deepseek.com/user/usage', {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        timeout: 15000,
      }),
    ]);

    const balanceData = balanceResp.status === 'fulfilled' && balanceResp.value.status === 200
      ? await balanceResp.value.json()
      : null;

    const usageData = usageResp.status === 'fulfilled' && usageResp.value.status === 200
      ? await usageResp.value.json()
      : null;

    // 两个请求都失败
    if (!balanceData && !usageData) {
      const firstError = balanceResp.status === 'rejected'
        ? balanceResp.reason?.message || '网络错误'
        : `HTTP ${balanceResp.value?.status || 'error'}`;
      return buildErrorWidget(`请求失败: ${firstError}`);
    }

    // 解析余额
    const balance = parseBalance(balanceData);
    const usage = parseUsage(usageData);

    // 根据小组件尺寸渲染不同布局
    return buildWidget(ctx.widgetFamily, balance, usage);

  } catch (e) {
    return buildErrorWidget(`异常: ${e.message || e}`);
  }
}

// ============================================================
// 数据解析
// ============================================================

function parseBalance(data) {
  if (!data) return null;

  // 新格式：balance_infos 数组
  if (data.balance_infos && Array.isArray(data.balance_infos)) {
    let totalBalance = 0;
    let toppedUp = 0;
    let granted = 0;
    let currency = 'CNY';

    for (const info of data.balance_infos) {
      totalBalance += parseFloat(info.total_balance) || 0;
      toppedUp += parseFloat(info.topped_up_balance) || 0;
      granted += parseFloat(info.granted_balance) || 0;
      currency = info.currency || currency;
    }

    return {
      available: data.is_available !== false,
      totalBalance,
      toppedUp,
      granted,
      currency,
    };
  }

  // 旧格式兼容：直接字段
  if (data.total_balance !== undefined) {
    return {
      available: data.is_available !== false,
      totalBalance: parseFloat(data.total_balance) || 0,
      toppedUp: parseFloat(data.topped_up_balance) || 0,
      granted: parseFloat(data.granted_balance) || 0,
      currency: data.currency || 'CNY',
    };
  }

  return null;
}

function parseUsage(data) {
  if (!data) return null;

  // usage 结构可能是 { total_usage: number, usage_records: [...] }
  // 或者 { total_tokens: number, ... }
  const result = {};

  if (data.total_tokens !== undefined) {
    result.totalTokens = data.total_tokens;
  }
  if (data.total_cost !== undefined) {
    result.totalCost = parseFloat(data.total_cost);
  }
  if (data.usage_records && Array.isArray(data.usage_records)) {
    result.recentRecords = data.usage_records.slice(0, 5);
  }

  // 如果有 total_usage 字段（可能是 token 数）
  if (data.total_usage !== undefined && result.totalTokens === undefined) {
    result.totalTokens = data.total_usage;
  }

  return Object.keys(result).length > 0 ? result : null;
}

// ============================================================
// 将字节数格式化为可读字符串
// ============================================================

function formatTokens(n) {
  if (n === undefined || n === null) return null;
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function formatCurrency(amount, currency) {
  const sym = currency === 'USD' ? '$' : currency === 'CNY' ? '¥' : currency + ' ';
  return `${sym}${amount.toFixed(2)}`;
}

// ============================================================
// Widget 构建
// ============================================================

function buildWidget(family, balance, usage) {
  const familyKey = family || 'systemMedium';

  switch (familyKey) {
    case 'systemSmall':
      return buildSmallWidget(balance, usage);
    case 'systemLarge':
      return buildLargeWidget(balance, usage);
    case 'accessoryRectangular':
      return buildAccessoryRectangular(balance, usage);
    case 'accessoryCircular':
      return buildAccessoryCircular(balance, usage);
    case 'accessoryInline':
      return buildAccessoryInline(balance, usage);
    case 'systemMedium':
    default:
      return buildMediumWidget(balance, usage);
  }
}

// ---------- 颜色主题 ----------

const THEME = {
  bg: '#0D1117',
  cardBg: '#161B22',
  accent: '#6366F1',       // Indigo
  accent2: '#8B5CF6',      // Violet
  green: '#22C55E',
  yellow: '#EAB308',
  red: '#EF4444',
  text: '#E6EDF3',
  textSecondary: '#8B949E',
  textMuted: '#484F58',
  border: '#30363D',
};

// ---------- 错误 Widget ----------

function buildErrorWidget(message) {
  return {
    type: 'widget',
    padding: 12,
    backgroundColor: '#1C1C1E',
    children: [
      {
        type: 'image',
        src: 'sf-symbol:exclamationmark.triangle.fill',
        width: 24,
        height: 24,
        color: '#FF9F0A',
      },
      { type: 'spacer', length: 8 },
      {
        type: 'text',
        text: message,
        font: { size: 'caption1', weight: 'medium' },
        textColor: '#FF9F0A',
        maxLines: 3,
        minScale: 0.7,
      },
    ],
  };
}

// ---------- systemSmall ----------

function buildSmallWidget(balance, usage) {
  const children = [
    buildHeader('DeepSeek', 'small'),
  ];

  if (balance) {
    children.push({ type: 'spacer' });
    children.push({
      type: 'text',
      text: formatCurrency(balance.totalBalance, balance.currency),
      font: { size: 'title2', weight: 'bold' },
      textColor: THEME.text,
      textAlign: 'center',
      minScale: 0.6,
    });
    children.push({ type: 'spacer', length: 2 });
    children.push({
      type: 'text',
      text: '剩余额度',
      font: { size: 'caption2', weight: 'regular' },
      textColor: THEME.textSecondary,
      textAlign: 'center',
    });
  }

  if (usage && usage.totalTokens != null) {
    children.push({ type: 'spacer' });
    children.push({
      type: 'text',
      text: formatTokens(usage.totalTokens),
      font: { size: 'caption1', weight: 'semibold' },
      textColor: THEME.accent,
      textAlign: 'center',
    });
    children.push({ type: 'spacer', length: 1 });
    children.push({
      type: 'text',
      text: 'Tokens',
      font: { size: 'caption2' },
      textColor: THEME.textMuted,
      textAlign: 'center',
    });
  }

  if (!balance && !usage) {
    children.push({ type: 'spacer' });
    children.push({
      type: 'text',
      text: '暂无数据',
      font: { size: 'body' },
      textColor: THEME.textMuted,
      textAlign: 'center',
    });
  }

  return {
    type: 'widget',
    padding: [14, 12],
    backgroundColor: THEME.bg,
    children,
  };
}

// ---------- systemMedium ----------

function buildMediumWidget(balance, usage) {
  const children = [buildHeader('DeepSeek API 用量', 'medium')];

  children.push({ type: 'spacer', length: 8 });

  // 余额卡片
  if (balance) {
    children.push(...buildBalanceCard(balance));
    children.push({ type: 'spacer', length: 8 });
  }

  // 用量信息
  if (usage && usage.totalTokens != null) {
    children.push(...buildUsageRow(usage));
  }

  if (!balance && !usage) {
    children.push({ type: 'spacer' });
    children.push({
      type: 'text',
      text: '暂无用量数据',
      font: { size: 'body' },
      textColor: THEME.textMuted,
      textAlign: 'center',
    });
  }

  return {
    type: 'widget',
    padding: [14, 16],
    backgroundColor: THEME.bg,
    children,
  };
}

function buildHeader(title, size) {
  return {
    type: 'stack',
    direction: 'row',
    alignItems: 'center',
    gap: 6,
    children: [
      {
        type: 'image',
        src: 'sf-symbol:brain.head.profile',
        width: size === 'small' ? 14 : 16,
        height: size === 'small' ? 14 : 16,
        color: THEME.accent,
      },
      {
        type: 'text',
        text: title,
        font: { size: size === 'small' ? 'footnote' : 'subheadline', weight: 'bold' },
        textColor: THEME.text,
      },
    ],
  };
}

function buildBalanceCard(balance) {
  const currency = balance.currency || 'CNY';
  return [
    // 总余额
    {
      type: 'stack',
      direction: 'row',
      alignItems: 'end',
      gap: 0,
      children: [
        {
          type: 'text',
          text: formatCurrency(balance.totalBalance, currency),
          font: { size: 'title', weight: 'bold' },
          textColor: THEME.text,
          flex: 1,
        },
        {
          type: 'stack',
          direction: 'row',
          alignItems: 'center',
          gap: 4,
          children: [
            {
              type: 'image',
              src: balance.available ? 'sf-symbol:checkmark.circle.fill' : 'sf-symbol:xmark.circle.fill',
              width: 12,
              height: 12,
              color: balance.available ? THEME.green : THEME.red,
            },
            {
              type: 'text',
              text: balance.available ? '可用' : '不可用',
              font: { size: 'caption2' },
              textColor: balance.available ? THEME.green : THEME.red,
            },
          ],
        },
      ],
    },

    // 充值金额 / 赠送金额 分行
    {
      type: 'stack',
      direction: 'row',
      gap: 12,
      children: [
        buildStatItem('充值', formatCurrency(balance.toppedUp, currency), THEME.textSecondary),
        buildStatItem('赠送', formatCurrency(balance.granted, currency), THEME.textSecondary),
      ],
    },
  ];
}

function buildStatItem(label, value, color) {
  return {
    type: 'stack',
    direction: 'column',
    gap: 1,
    children: [
      {
        type: 'text',
        text: value,
        font: { size: 'footnote', weight: 'semibold' },
        textColor: color,
      },
      {
        type: 'text',
        text: label,
        font: { size: 'caption2' },
        textColor: THEME.textMuted,
      },
    ],
  };
}

function buildUsageRow(usage) {
  const items = [];

  if (usage.totalTokens != null) {
    items.push({
      type: 'stack',
      direction: 'column',
      gap: 2,
      children: [
        {
          type: 'text',
          text: formatTokens(usage.totalTokens),
          font: { size: 'title3', weight: 'bold' },
          textColor: THEME.accent,
        },
        {
          type: 'text',
          text: '总 Token 用量',
          font: { size: 'caption2' },
          textColor: THEME.textMuted,
        },
      ],
    });
  }

  if (usage.totalCost != null) {
    items.push({
      type: 'stack',
      direction: 'column',
      gap: 2,
      children: [
        {
          type: 'text',
          text: `$${usage.totalCost.toFixed(4)}`,
          font: { size: 'title3', weight: 'bold' },
          textColor: THEME.accent2,
        },
        {
          type: 'text',
          text: '总花费',
          font: { size: 'caption2' },
          textColor: THEME.textMuted,
        },
      ],
    });
  }

  if (items.length === 0) return [];

  return [{
    type: 'stack',
    direction: 'row',
    gap: 24,
    children: items,
  }];
}

// ---------- systemLarge ----------

function buildLargeWidget(balance, usage) {
  const children = [buildHeader('DeepSeek API 用量监控', 'large')];

  children.push({ type: 'spacer', length: 12 });

  if (balance) {
    children.push(...buildLargeBalanceSection(balance));
    children.push({ type: 'spacer', length: 12 });
  }

  if (usage) {
    children.push({
      type: 'stack',
      direction: 'row',
      gap: 12,
      children: [
        buildGlassCard(
          'brain.head.profile',
          THEME.accent,
          formatTokens(usage.totalTokens) || '—',
          '总 Tokens',
        ),
        buildGlassCard(
          'dollarsign.circle',
          THEME.accent2,
          usage.totalCost != null ? `$${usage.totalCost.toFixed(4)}` : '—',
          '总花费',
        ),
      ],
    });

    // 最近记录（如果有）
    if (usage.recentRecords && usage.recentRecords.length > 0) {
      children.push({ type: 'spacer', length: 12 });
      children.push({
        type: 'text',
        text: '最近使用',
        font: { size: 'caption1', weight: 'semibold' },
        textColor: THEME.textSecondary,
      });
      children.push({ type: 'spacer', length: 6 });

      for (const record of usage.recentRecords.slice(0, 3)) {
        children.push(buildRecentRecord(record));
        children.push({ type: 'spacer', length: 4 });
      }
    }
  }

  if (!balance && !usage) {
    children.push({ type: 'spacer' });
    children.push({
      type: 'text',
      text: '暂无用量数据\n请在环境变量中设置 DEEPSEEK_API_KEY',
      font: { size: 'body' },
      textColor: THEME.textMuted,
      textAlign: 'center',
      maxLines: 3,
    });
  }

  return {
    type: 'widget',
    padding: [16, 18],
    backgroundColor: THEME.bg,
    children,
  };
}

function buildLargeBalanceSection(balance) {
  const currency = balance.currency || 'CNY';
  return [
    {
      type: 'stack',
      direction: 'row',
      alignItems: 'end',
      gap: 8,
      children: [
        {
          type: 'text',
          text: formatCurrency(balance.totalBalance, currency),
          font: { size: 'largeTitle', weight: 'bold' },
          textColor: THEME.text,
        },
        {
          type: 'stack',
          direction: 'row',
          alignItems: 'center',
          gap: 4,
          children: [
            {
              type: 'image',
              src: balance.available ? 'sf-symbol:checkmark.circle.fill' : 'sf-symbol:xmark.circle.fill',
              width: 16,
              height: 16,
              color: balance.available ? THEME.green : THEME.red,
            },
            {
              type: 'text',
              text: balance.available ? 'API 可用' : 'API 不可用',
              font: { size: 'footnote', weight: 'medium' },
              textColor: balance.available ? THEME.green : THEME.red,
            },
          ],
        },
      ],
    },
    { type: 'spacer', length: 8 },
    {
      type: 'stack',
      direction: 'row',
      gap: 16,
      children: [
        buildStatItem('充值额度', formatCurrency(balance.toppedUp, currency), THEME.textSecondary),
        buildStatItem('赠送额度', formatCurrency(balance.granted, currency), THEME.textSecondary),
      ],
    },
  ];
}

function buildGlassCard(icon, iconColor, value, label) {
  return {
    type: 'stack',
    direction: 'column',
    gap: 6,
    padding: [12, 14],
    backgroundColor: THEME.cardBg,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: THEME.border,
    flex: 1,
    children: [
      {
        type: 'image',
        src: `sf-symbol:${icon}`,
        width: 20,
        height: 20,
        color: iconColor,
      },
      {
        type: 'text',
        text: value,
        font: { size: 'headline', weight: 'bold' },
        textColor: THEME.text,
        minScale: 0.7,
      },
      {
        type: 'text',
        text: label,
        font: { size: 'caption2' },
        textColor: THEME.textMuted,
      },
    ],
  };
}

function buildRecentRecord(record) {
  const model = record.model || record.model_name || 'Unknown';
  const tokens = record.tokens || record.usage || record.total_tokens || 0;
  const cost = record.cost != null ? `$${Number(record.cost).toFixed(4)}` : '';

  return {
    type: 'stack',
    direction: 'row',
    alignItems: 'center',
    gap: 8,
    padding: [8, 10],
    backgroundColor: THEME.cardBg,
    borderRadius: 8,
    children: [
      {
        type: 'text',
        text: model,
        font: { size: 'caption1', weight: 'medium' },
        textColor: THEME.text,
        flex: 1,
        minScale: 0.7,
      },
      {
        type: 'text',
        text: formatTokens(tokens),
        font: { size: 'caption2' },
        textColor: THEME.textSecondary,
      },
      cost ? {
        type: 'text',
        text: cost,
        font: { size: 'caption2' },
        textColor: THEME.accent2,
      } : { type: 'spacer', length: 0 },
    ],
  };
}

// ---------- Lock Screen: accessoryRectangular ----------

function buildAccessoryRectangular(balance, usage) {
  const children = [];
  const primaryText = balance
    ? formatCurrency(balance.totalBalance, balance.currency)
    : '—';

  children.push({
    type: 'stack',
    direction: 'row',
    alignItems: 'center',
    gap: 6,
    children: [
      {
        type: 'image',
        src: 'sf-symbol:brain.head.profile',
        width: 14,
        height: 14,
        color: THEME.accent,
      },
      {
        type: 'text',
        text: `DeepSeek  ${primaryText}`,
        font: { size: 'caption1', weight: 'semibold' },
        textColor: THEME.text,
        flex: 1,
        minScale: 0.6,
      },
    ],
  });

  if (usage && usage.totalTokens != null) {
    children.push({ type: 'spacer', length: 2 });
    children.push({
      type: 'text',
      text: `${formatTokens(usage.totalTokens)} tokens`,
      font: { size: 'caption2' },
      textColor: THEME.textMuted,
    });
  }

  return {
    type: 'widget',
    padding: [10, 14],
    backgroundColor: THEME.bg,
    children,
  };
}

// ---------- Lock Screen: accessoryCircular ----------

function buildAccessoryCircular(balance, usage) {
  const text = balance
    ? formatCurrency(balance.totalBalance, balance.currency)
    : '—';

  return {
    type: 'widget',
    padding: 8,
    backgroundColor: THEME.bg,
    children: [
      {
        type: 'image',
        src: 'sf-symbol:brain.head.profile',
        width: 18,
        height: 18,
        color: THEME.accent,
      },
      { type: 'spacer', length: 2 },
      {
        type: 'text',
        text: text,
        font: { size: 10, weight: 'bold' },
        textColor: THEME.text,
        textAlign: 'center',
        minScale: 0.5,
      },
    ],
  };
}

// ---------- Lock Screen: accessoryInline ----------

function buildAccessoryInline(balance, usage) {
  const parts = [];
  if (balance) {
    parts.push(formatCurrency(balance.totalBalance, balance.currency));
  }
  if (usage && usage.totalTokens != null) {
    parts.push(`${formatTokens(usage.totalTokens)} tokens`);
  }
  const text = parts.length > 0 ? parts.join(' · ') : 'DeepSeek';

  return {
    type: 'widget',
    children: [
      {
        type: 'text',
        text,
        font: { size: 'caption1', weight: 'medium' },
        textColor: THEME.text,
        textAlign: 'center',
        minScale: 0.5,
      },
    ],
  };
}
