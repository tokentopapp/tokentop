import type { AgentSessionAggregate } from '../../agents/types.ts';
import { useColors } from '../contexts/ThemeContext.tsx';

interface SessionDetailsDrawerProps {
  session: AgentSessionAggregate;
  onClose: () => void;
}

function formatTokens(count: number): string {
  if (count >= 1_000_000) {
    return (count / 1_000_000).toFixed(1) + 'M';
  }
  if (count >= 1_000) {
    return (count / 1_000).toFixed(1) + 'K';
  }
  return count.toString();
}

function formatCost(cost: number | undefined): string {
  if (cost === undefined) return '$0.00';
  return '$' + cost.toFixed(2);
}

function formatDuration(startedAt: number, lastActivityAt: number): string {
  const ms = lastActivityAt - startedAt;
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);
}

function padLeft(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : ' '.repeat(len - str.length) + str;
}

export function SessionDetailsDrawer({ session }: SessionDetailsDrawerProps) {
  const colors = useColors();
  
  const duration = formatDuration(session.startedAt, session.lastActivityAt);
  const startDate = new Date(session.startedAt).toLocaleString();
  const projectDisplay = session.projectPath ? session.projectPath.split('/').slice(-2).join('/') : 'N/A';
  
  return (
    <box 
      position="absolute" 
      top="10%" 
      left="10%" 
      width="80%" 
      height="80%" 
      border 
      borderStyle="double" 
      borderColor={colors.primary} 
      flexDirection="column" 
      padding={1} 
      zIndex={15}
      backgroundColor={colors.background}
    >
      <box flexDirection="column" gap={1}>
        <text height={1} fg={colors.primary}><strong>SESSION DETAILS</strong></text>
        
        <box flexDirection="column" border borderColor={colors.border} padding={1}>
          <text height={1} fg={colors.text}>{padRight('Session: ' + session.sessionId, 80)}</text>
          <text height={1} fg={colors.text}>{padRight('Agent: ' + session.agentName + '    Project: ' + projectDisplay, 80)}</text>
          <text height={1} fg={colors.text}>{padRight('Started: ' + startDate + '    Duration: ' + duration + '    Cost: ' + formatCost(session.totalCostUsd), 80)}</text>
        </box>
        
        <text height={1} fg={colors.primary}><strong>USAGE</strong></text>
        
        <box flexDirection="column" border borderColor={colors.border} padding={0}>
          <text height={1} fg={colors.textSubtle} paddingLeft={1}>{padRight('Model', 20) + padRight('Provider', 12) + padLeft('Requests', 10) + padLeft('Input Tok', 12) + padLeft('Output Tok', 12) + padLeft('Cost', 10)}</text>
          
          <text height={1} fg={colors.border} paddingLeft={1}>{'─'.repeat(76)}</text>
          
          <scrollbox flexGrow={1} height={8}>
            {session.streams.map((stream, idx) => {
              const model = stream.modelId.length > 19 ? stream.modelId.slice(0, 18) + '…' : stream.modelId;
              const provider = stream.providerId.length > 11 ? stream.providerId.slice(0, 10) + '…' : stream.providerId;
              return (
                <text key={`${stream.modelId}-${idx}`} height={1} fg={colors.text} paddingLeft={1}>
                  {padRight(model, 20) + padRight(provider, 12) + padLeft(String(stream.requestCount), 10) + padLeft(formatTokens(stream.tokens.input), 12) + padLeft(formatTokens(stream.tokens.output), 12) + padLeft(formatCost(stream.costUsd), 10)}
                </text>
              );
            })}
          </scrollbox>
        </box>
        
        <text height={1} fg={colors.primary}><strong>TIMELINE</strong></text>

        <box flexDirection="column" border borderColor={colors.border} padding={1}>
          <text height={1} fg={colors.textSubtle}>{'·'.repeat(50)}</text>
          <text height={1} fg={colors.textMuted}>{formatTime(session.startedAt) + ' '.repeat(38) + formatTime(session.lastActivityAt)}</text>
        </box>

        <text height={1} fg={colors.textMuted}>[c] Copy summary  [x] Export  [Esc] Close</text>
      </box>
    </box>
  );
}
