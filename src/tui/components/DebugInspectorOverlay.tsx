import { useColors } from '../contexts/ThemeContext.tsx';

export interface DebugInspectorSession {
  sessionId: string;
  agentName: string;
  status: string;
  totals: { input: number; output: number };
  lastActivityAt: number;
}

export interface DebugInspectorDebugData {
  lastDeltaTokens: number;
  lastDt: number;
  bucketsShifted: number;
  currentBucketValue: number;
  refreshCount: number;
  lastRefreshTime: number;
}

export interface DebugInspectorActivity {
  instantRate: number;
  avgRate: number;
  isSpike: boolean;
}

export interface DebugInspectorProps {
  sessions: DebugInspectorSession[];
  debugData: DebugInspectorDebugData;
  activity: DebugInspectorActivity;
  sparkData: number[];
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);
}

export function DebugInspectorOverlay({ sessions, debugData, activity, sparkData }: DebugInspectorProps) {
  const colors = useColors();
  
  const totalTokens = sessions.reduce((sum, s) => sum + s.totals.input + s.totals.output, 0);
  const activeSessions = sessions.filter(s => s.status === 'active');
  const now = Date.now();
  
  return (
    <box 
      position="absolute" 
      top="5%" 
      left="5%" 
      width="90%" 
      height="90%" 
      border 
      borderStyle="double" 
      borderColor={colors.warning} 
      flexDirection="column" 
      padding={1} 
      zIndex={20}
      backgroundColor={colors.background}
    >
      <box justifyContent="center">
        <text fg={colors.warning}><strong>DEBUG INSPECTOR</strong></text>
      </box>
      
      <box flexDirection="row" gap={2} marginTop={1} height={10}>
        <box flexDirection="column" flexGrow={1} border borderColor={colors.border} padding={1} overflow="hidden">
          <text height={1} fg={colors.primary}>{padRight('Bucket Data', 36)}</text>
          <text height={1} fg={colors.textMuted}>{padRight('deltaTokens: ' + debugData.lastDeltaTokens.toLocaleString(), 36)}</text>
          <text height={1} fg={colors.textMuted}>{padRight('dt:          ' + debugData.lastDt.toFixed(3) + 's', 36)}</text>
          <text height={1} fg={colors.textMuted}>{padRight('shifted:     ' + debugData.bucketsShifted, 36)}</text>
          <text height={1} fg={colors.textMuted}>{padRight('currBucket:  ' + debugData.currentBucketValue.toFixed(1), 36)}</text>
          <text height={1} fg={colors.textMuted}>{padRight('buckets[5]:  [' + sparkData.slice(-5).map(v => v.toFixed(0)).join(',') + ']', 36)}</text>
        </box>
        
        <box flexDirection="column" flexGrow={1} border borderColor={colors.border} padding={1} overflow="hidden">
          <text height={1} fg={colors.primary}>{padRight('Activity State', 36)}</text>
          <text height={1} fg={colors.textMuted}>{padRight('instantRate: ' + (activity.instantRate || 0).toFixed(1) + '/s', 36)}</text>
          <text height={1} fg={colors.textMuted}>{padRight('avgRate:     ' + (activity.avgRate || 0).toFixed(1) + '/s', 36)}</text>
          <text height={1} fg={colors.textMuted}>{padRight('isSpike:     ' + (activity.isSpike ? 'YES' : 'no'), 36)}</text>
        </box>
        
        <box flexDirection="column" flexGrow={1} border borderColor={colors.border} padding={1} overflow="hidden">
          <text height={1} fg={colors.primary}>{padRight('Refresh Stats', 36)}</text>
          <text height={1} fg={colors.textMuted}>{padRight('count:  ' + String(debugData.refreshCount), 36)}</text>
          <text height={1} fg={colors.textMuted}>{padRight('last:   ' + new Date(debugData.lastRefreshTime).toLocaleTimeString(), 36)}</text>
          <text height={1} fg={colors.textMuted}>{padRight('age:    ' + ((now - debugData.lastRefreshTime) / 1000).toFixed(1) + 's', 36)}</text>
          <text height={1} fg={colors.textMuted}>{padRight('tokens: ' + totalTokens.toLocaleString(), 36)}</text>
        </box>
      </box>
      
      <box flexDirection="column" flexGrow={1} marginTop={1} border borderColor={colors.border} padding={1} overflow="hidden">
        <text height={1} fg={colors.primary}><strong>Sessions ({sessions.length} total, {activeSessions.length} active)</strong></text>
        <box flexDirection="row" marginTop={1} height={1}>
          <text width={25} fg={colors.textSubtle}>{padRight('SESSION ID', 25)}</text>
          <text width={12} fg={colors.textSubtle}>{padRight('AGENT', 12)}</text>
          <text width={10} fg={colors.textSubtle}>{padRight('STATUS', 10)}</text>
          <text width={15} fg={colors.textSubtle}>{padRight('TOKENS', 15)}</text>
          <text width={15} fg={colors.textSubtle}>{padRight('LAST ACTIVITY', 15)}</text>
          <text width={10} fg={colors.textSubtle}>{padRight('AGE', 10)}</text>
        </box>
        <scrollbox flexGrow={1}>
          {sessions.slice(0, 20).map(s => {
            const age = now - s.lastActivityAt;
            const ageStr = age < 60000 ? `${(age / 1000).toFixed(0)}s` : `${(age / 60000).toFixed(1)}m`;
            const timeStr = new Date(s.lastActivityAt).toLocaleTimeString();
            return (
              <box key={s.sessionId} flexDirection="row" height={1}>
                <text width={25} fg={colors.text}>{padRight(s.sessionId.slice(0, 24), 25)}</text>
                <text width={12} fg={colors.text}>{padRight(s.agentName, 12)}</text>
                <text width={10} fg={s.status === 'active' ? colors.success : colors.textMuted}>{padRight(s.status, 10)}</text>
                <text width={15} fg={colors.text}>{padRight((s.totals.input + s.totals.output).toLocaleString(), 15)}</text>
                <text width={15} fg={colors.text}>{padRight(timeStr, 15)}</text>
                <text width={10} fg={age < 120000 ? colors.success : colors.textMuted}>{padRight(ageStr, 10)}</text>
              </box>
            );
          })}
        </scrollbox>
      </box>
      
      <box justifyContent="center" marginTop={1}>
        <text fg={colors.textMuted}>Press Shift+D or Esc to close</text>
      </box>
    </box>
  );
}
