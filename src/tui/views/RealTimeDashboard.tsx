import { useState, useEffect, useMemo } from 'react';
import { useKeyboard } from '@opentui/react';
import { useColors } from '../contexts/ThemeContext.tsx';
import { usePlugins } from '../contexts/PluginContext.tsx';

interface AgentSession {
  sessionId: string;
  agentName: 'OpenCode' | 'Claude Code' | 'Gemini CLI' | 'Cursor' | 'Windsurf';
  providerId: string;  
  modelId: string;     
  projectPath: string;
  tokens: {
    input: number;
    output: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
  cost: number;        
  startedAt: number;   
  lastActivityAt: number;
  requestCount: number;
}

function generateMockSessions(): AgentSession[] {
  const agents = ['OpenCode', 'Claude Code', 'Gemini CLI', 'Cursor', 'Windsurf'] as const;
  const models = [
    { id: 'claude-3-7-sonnet', provider: 'anthropic', costIn: 3.0, costOut: 15.0 },
    { id: 'claude-3-5-sonnet', provider: 'anthropic', costIn: 3.0, costOut: 15.0 },
    { id: 'claude-3-haiku', provider: 'anthropic', costIn: 0.25, costOut: 1.25 },
    { id: 'gpt-4o', provider: 'openai', costIn: 2.5, costOut: 10.0 },
    { id: 'gpt-4o-mini', provider: 'openai', costIn: 0.15, costOut: 0.6 },
    { id: 'gemini-1.5-pro', provider: 'google', costIn: 1.25, costOut: 5.0 },
    { id: 'gemini-2.0-flash', provider: 'google', costIn: 0.1, costOut: 0.4 },
  ];
  
  const projects = ['~/dev/tokentop', '~/work/backend-api', '~/experiments/ui-kit', '~/personal/blog', '~/oss/react'];
  
  const sessions: AgentSession[] = [];
  const count = 4 + Math.floor(Math.random() * 5);

  for (let i = 0; i < count; i++) {
    const model = models[Math.floor(Math.random() * models.length)]!;
    const agent = agents[Math.floor(Math.random() * agents.length)]!;
    const project = projects[Math.floor(Math.random() * projects.length)]!;
    
    const input = 5000 + Math.floor(Math.random() * 150000);
    const output = 1000 + Math.floor(Math.random() * 30000);
    
    const cost = (input * model.costIn + output * model.costOut) / 1000000;

    sessions.push({
      sessionId: `ses_${Math.random().toString(36).substr(2, 6)}`,
      agentName: agent,
      providerId: model.provider,
      modelId: model.id,
      projectPath: project,
      tokens: { input, output },
      cost,
      startedAt: Date.now() - Math.random() * 3600000 * 4,
      lastActivityAt: Date.now() - Math.random() * 60000 * 10,
      requestCount: 10 + Math.floor(Math.random() * 200)
    });
  }

  return sessions.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
}

function Sparkline({ data, width = 60 }: { data: number[], width?: number }) {
  const colors = useColors();
  const chars = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  
  const max = Math.max(...data, 1);
  const normalized = data.map(v => Math.min(8, Math.floor((v / max) * 8)));
  
  const displayData = normalized.slice(-width);
  const padding = width - displayData.length;
  
  const getColor = (v: number) => v > 6 ? colors.error : v > 3 ? colors.warning : colors.success;
  
  const groups: { color: string; chars: string }[] = [];
  for (const v of displayData) {
    const color = getColor(v);
    const char = chars[v] ?? ' ';
    if (groups.length > 0 && groups[groups.length - 1]!.color === color) {
      groups[groups.length - 1]!.chars += char;
    } else {
      groups.push({ color, chars: char });
    }
  }
  
  return (
    <text>
      {padding > 0 && <span>{' '.repeat(padding)}</span>}
      {groups.map((group, i) => (
        <span key={i} fg={group.color}>{group.chars}</span>
      ))}
    </text>
  );
}

function BarChart({ label, value, max, color, valueLabel }: { label: string, value: number, max: number, color: string, valueLabel: string }) {
  const colors = useColors();
  const width = 20;
  const filled = Math.min(width, Math.ceil((value / max) * width));
  const empty = width - filled;
  
  return (
    <box flexDirection="row" gap={1}>
      <text width={16} fg={colors.text}>{label}</text>
      <text>
        <span fg={color}>{'█'.repeat(filled)}</span>
        <span fg={colors.textSubtle}>{'░'.repeat(empty)}</span>
      </text>
      <text fg={colors.textMuted}>{valueLabel}</text>
    </box>
  );
}

function LimitGauge({ 
  label, 
  usedPercent, 
  color,
}: { 
  label: string; 
  usedPercent: number | null; 
  color: string;
}) {
  const colors = useColors();
  const barWidth = 8;
  const percent = usedPercent ?? 0;
  const filled = Math.min(barWidth, Math.round((percent / 100) * barWidth));
  const empty = barWidth - filled;
  
  const barColor = percent >= 90 ? colors.error : percent >= 70 ? colors.warning : color;
  const statusIcon = percent >= 90 ? '!' : percent >= 70 ? '~' : '●';
  const statusColor = percent >= 90 ? colors.error : percent >= 70 ? colors.warning : colors.success;
  
  const displayLabel = label.length > 10 ? label.slice(0, 9) + '…' : label.padEnd(10);
  const percentStr = usedPercent !== null ? `${Math.round(percent)}%`.padStart(4) : ' -- ';
  
  return (
    <box width={28} overflow="hidden">
      <text>
        <span fg={statusColor}>{statusIcon} </span>
        <span fg={colors.text}>{displayLabel}</span>
        <span fg={barColor}>{'█'.repeat(filled)}</span>
        <span fg={colors.textSubtle}>{'░'.repeat(empty)}</span>
        <span fg={colors.textMuted}>{percentStr}</span>
      </text>
    </box>
  );
}

export function RealTimeDashboard() {
  const colors = useColors();
  const { providers } = usePlugins();
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [selectedRow, setSelectedRow] = useState(0);
  const [sparkData, setSparkData] = useState<number[]>([]);
  const [now, setNow] = useState(new Date());

  const configuredProviders = useMemo(() => {
    return Array.from(providers.values())
      .filter(p => p.configured && p.usage)
      .sort((a, b) => {
        const aMax = getMaxUsedPercent(a);
        const bMax = getMaxUsedPercent(b);
        return bMax - aMax;
      });
  }, [providers]);

  function getMaxUsedPercent(provider: { usage: { limits?: { primary?: { usedPercent: number | null }; secondary?: { usedPercent: number | null }; items?: Array<{ usedPercent: number | null }> } } | null }): number {
    if (!provider.usage?.limits) return 0;
    const items = provider.usage.limits.items ?? [];
    if (items.length > 0) {
      return Math.max(...items.map(i => i.usedPercent ?? 0));
    }
    const primary = provider.usage.limits.primary?.usedPercent ?? 0;
    const secondary = provider.usage.limits.secondary?.usedPercent ?? 0;
    return Math.max(primary, secondary);
  }

  const getProviderDisplayColor = (id: string) => {
    if (id.includes('anthropic') || id.includes('claude')) return '#d97757';
    if (id.includes('openai') || id.includes('codex')) return '#10a37f';
    if (id.includes('google') || id.includes('gemini')) return '#4285f4';
    if (id.includes('github') || id.includes('copilot')) return '#6e40c9';
    return colors.primary;
  };

  useEffect(() => {
    setSessions(generateMockSessions());
    
    setSparkData(Array.from({ length: 60 }, () => Math.floor(Math.random() * 100)));

    const interval = setInterval(() => {
      setNow(new Date());
      
      setSparkData(prev => [...prev.slice(1), Math.floor(Math.random() * 100)]);
      
      setSessions(prev => prev.map(s => {
        if (Math.random() > 0.7) {
          const addedInput = Math.floor(Math.random() * 1000);
          const addedOutput = Math.floor(Math.random() * 200);
          const addedCost = (addedInput * 3.0 + addedOutput * 15.0) / 1000000;
          return {
            ...s,
            tokens: {
              ...s.tokens,
              input: s.tokens.input + addedInput,
              output: s.tokens.output + addedOutput
            },
            cost: s.cost + addedCost,
            requestCount: s.requestCount + 1,
            lastActivityAt: Date.now()
          };
        }
        return s;
      }));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  useKeyboard((key) => {
    if (key.name === 'down' || key.name === 'j') {
      setSelectedRow(curr => Math.min(curr + 1, sessions.length - 1));
    } else if (key.name === 'up' || key.name === 'k') {
      setSelectedRow(curr => Math.max(curr - 1, 0));
    }
  });

  const totalCost = sessions.reduce((acc, s) => acc + s.cost, 0);
  const totalTokens = sessions.reduce((acc, s) => acc + s.tokens.input + s.tokens.output, 0);
  const totalRequests = sessions.reduce((acc, s) => acc + s.requestCount, 0);
  
  const modelStats = useMemo(() => {
    const stats: Record<string, number> = {};
    sessions.forEach(s => {
      stats[s.modelId] = (stats[s.modelId] || 0) + s.cost;
    });
    return Object.entries(stats)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
  }, [sessions]);
  
  const maxModelCost = Math.max(...modelStats.map(([, c]) => c), 0.01);

  const providerStats = useMemo(() => {
    const stats: Record<string, number> = {};
    sessions.forEach(s => {
      stats[s.providerId] = (stats[s.providerId] || 0) + s.cost;
    });
    return Object.entries(stats).sort(([, a], [, b]) => b - a);
  }, [sessions]);

  const maxProviderCost = Math.max(...providerStats.map(([, c]) => c), 0.01);

  const getProviderColor = (id: string) => {
    if (id.includes('anthropic')) return '#d97757';
    if (id.includes('openai')) return '#10a37f';
    if (id.includes('google')) return '#4285f4';
    return colors.text;
  };

  const formatCurrency = (val: number) => `$${val.toFixed(2)}`;
  const formatTokens = (val: number) => val > 1000000 ? `${(val/1000000).toFixed(1)}M` : `${(val/1000).toFixed(1)}K`;

  const allLimitGauges = useMemo(() => {
    type GaugeData = { key: string; label: string; usedPercent: number | null; color: string };
    const gaugeData: GaugeData[] = [];
    
    configuredProviders.slice(0, 8).forEach((provider) => {
      const providerColor = getProviderDisplayColor(provider.plugin.id);
      const maxPercent = getMaxUsedPercent(provider);
      
      gaugeData.push({
        key: provider.plugin.id,
        label: provider.plugin.name,
        usedPercent: maxPercent > 0 ? maxPercent : null,
        color: providerColor,
      });
    });
    
    return gaugeData;
  }, [configuredProviders, getProviderDisplayColor]);

  return (
    <box flexDirection="column" flexGrow={1} padding={1} gap={1} overflow="hidden">
      <box flexDirection="row" gap={3} border borderStyle="single" padding={1} borderColor={colors.border} flexShrink={0}>
        <box flexDirection="column" width={14}>
          <text fg={colors.textSubtle}>COST</text>
          <text fg={colors.success}><strong>{formatCurrency(totalCost)}</strong></text>
        </box>
        <box flexDirection="column" width={14}>
          <text fg={colors.textSubtle}>TOKENS</text>
          <text fg={colors.info}><strong>{formatTokens(totalTokens)}</strong></text>
        </box>
        <box flexDirection="column" width={14}>
          <text fg={colors.textSubtle}>REQS</text>
          <text fg={colors.text}><strong>{totalRequests.toLocaleString()}</strong></text>
        </box>
        <box flexDirection="column" flexGrow={1} marginLeft={2}>
          <text fg={colors.textSubtle}>ACTIVITY</text>
          <Sparkline data={sparkData} width={40} />
        </box>
      </box>

      {configuredProviders.length > 0 && (
        <box flexDirection="column" border borderStyle="single" padding={1} borderColor={colors.border} overflow="hidden">
          <text fg={colors.textSubtle} marginBottom={1}>PROVIDER LIMITS</text>
          <box flexDirection="row" flexWrap="wrap" gap={1} overflow="hidden">
            {allLimitGauges.slice(0, 8).map(g => (
              <LimitGauge key={g.key} label={g.label} usedPercent={g.usedPercent} color={g.color} />
            ))}
          </box>
        </box>
      )}

      <box flexDirection="row" gap={1} flexGrow={1}>
        
        <box flexDirection="column" flexGrow={2} border borderStyle="single" borderColor={colors.border}>
          <box flexDirection="row" paddingLeft={1} paddingRight={1} paddingBottom={1}>
            <text fg={colors.textSubtle}>ACTIVE SESSIONS</text>
          </box>
          
          <box flexDirection="row" paddingLeft={1} paddingRight={1}>
            <text width={8} fg={colors.textSubtle}>PID</text>
            <text width={12} fg={colors.textSubtle}>AGENT</text>
            <text width={20} fg={colors.textSubtle}>MODEL</text>
            <text width={10} fg={colors.textSubtle}>TOKENS</text>
            <text width={10} fg={colors.textSubtle}>COST</text>
            <text flexGrow={1} fg={colors.textSubtle} paddingLeft={2}>PROJECT</text>
          </box>
          
          <scrollbox flexGrow={1}>
            <box flexDirection="column">
              {sessions.map((session, idx) => {
                const isSelected = idx === selectedRow;
                const rowFg = isSelected ? colors.background : colors.text;

                return (
                  <box 
                    key={session.sessionId} 
                    flexDirection="row" 
                    paddingLeft={1} 
                    paddingRight={1}
                    {...(isSelected ? { backgroundColor: colors.primary } : {})}
                  >
                    <text width={8} fg={isSelected ? rowFg : colors.textMuted}>{session.sessionId.substr(4)}</text>
                    <text width={12} fg={isSelected ? rowFg : colors.text}>{session.agentName}</text>
                    <text width={20} fg={isSelected ? rowFg : getProviderColor(session.providerId)}>{session.modelId}</text>
                    <text width={10} fg={isSelected ? rowFg : colors.text}>{formatTokens(session.tokens.input + session.tokens.output)}</text>
                    <text width={10} fg={isSelected ? rowFg : colors.success}>{formatCurrency(session.cost)}</text>
                    <text flexGrow={1} fg={isSelected ? rowFg : colors.textSubtle} paddingLeft={2}>{session.projectPath}</text>
                  </box>
                );
              })}
            </box>
          </scrollbox>
        </box>

        <box flexDirection="column" width={45} gap={1}>
          
          <box flexDirection="column" border borderStyle="single" borderColor={colors.border} flexGrow={1} padding={1}>
            <text fg={colors.textSubtle} marginBottom={1}>MODEL BREAKDOWN</text>
            <box flexDirection="column" gap={0}>
              {modelStats.map(([modelId, cost]) => (
                <BarChart 
                  key={modelId}
                  label={modelId.length > 15 ? modelId.substr(0,14)+'…' : modelId}
                  value={cost}
                  max={maxModelCost}
                  color={getProviderColor(modelId.includes('gpt') ? 'openai' : modelId.includes('claude') ? 'anthropic' : 'google')}
                  valueLabel={formatCurrency(cost)}
                />
              ))}
            </box>
          </box>

          <box flexDirection="column" border borderStyle="single" borderColor={colors.border} flexGrow={1} padding={1}>
            <text fg={colors.textSubtle} marginBottom={1}>COST BY PROVIDER</text>
            <box flexDirection="column" gap={0}>
              {providerStats.map(([provider, cost]) => (
                <BarChart 
                  key={provider}
                  label={provider.charAt(0).toUpperCase() + provider.slice(1)}
                  value={cost}
                  max={maxProviderCost}
                  color={getProviderColor(provider)}
                  valueLabel={formatCurrency(cost)}
                />
              ))}
            </box>
          </box>

        </box>
      </box>
      
      <box flexDirection="row" justifyContent="space-between" paddingLeft={1}>
        <text fg={colors.textSubtle}>
          Last update: {now.toLocaleTimeString()}
        </text>
        <text fg={colors.textSubtle}>
          Use ↑/↓ to navigate sessions
        </text>
      </box>
    </box>
  );
}
