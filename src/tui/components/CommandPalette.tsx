import { useState, useEffect, useMemo } from 'react';
import { useKeyboard } from '@opentui/react';
import { useColors } from '../contexts/ThemeContext.tsx';

export interface CommandAction {
  id: string;
  label: string;
  shortcut?: string;
  action: () => void;
}

interface CommandPaletteProps {
  commands: CommandAction[];
  onClose: () => void;
}

export function CommandPalette({ commands, onClose }: CommandPaletteProps) {
  const colors = useColors();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  const filteredCommands = useMemo(() => {
    if (!query) return commands;
    const lowerQuery = query.toLowerCase();
    return commands.filter(cmd => 
      cmd.label.toLowerCase().includes(lowerQuery) ||
      cmd.id.toLowerCase().includes(lowerQuery)
    );
  }, [commands, query]);
  
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);
  
  useKeyboard((key) => {
    if (key.name === 'escape') {
      onClose();
      return;
    }
    
    if (key.name === 'return') {
      const selected = filteredCommands[selectedIndex];
      if (selected) {
        onClose();
        selected.action();
      }
      return;
    }
    
    if (key.name === 'down' || key.name === 'j' || (key.ctrl && key.name === 'n')) {
      setSelectedIndex(i => Math.min(i + 1, filteredCommands.length - 1));
      return;
    }
    
    if (key.name === 'up' || key.name === 'k' || (key.ctrl && key.name === 'p')) {
      setSelectedIndex(i => Math.max(i - 1, 0));
      return;
    }
    
    if (key.name === 'backspace') {
      setQuery(q => q.slice(0, -1));
      return;
    }
    
    if (key.sequence && key.sequence.length === 1 && /^[a-zA-Z0-9\-_. ]$/.test(key.sequence)) {
      setQuery(q => q + key.sequence);
      return;
    }
  });
  
  return (
    <box
      position="absolute"
      top="20%"
      left="25%"
      width={60}
      height={Math.min(filteredCommands.length + 5, 20)}
      border
      borderStyle="double"
      borderColor={colors.primary}
      flexDirection="column"
      zIndex={20}
      backgroundColor={colors.background}
    >
      <box padding={1}>
        <text>
          <span fg={colors.textMuted}>: </span>
          <span fg={colors.text}>{query}</span>
          <span fg={colors.primary}>│</span>
        </text>
      </box>
      
      <scrollbox flexGrow={1}>
        <box flexDirection="column">
          {filteredCommands.length === 0 ? (
            <box padding={1}>
              <text fg={colors.textMuted}>No matching commands</text>
            </box>
          ) : (
            filteredCommands.map((cmd, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <box
                  key={cmd.id}
                  flexDirection="row"
                  justifyContent="space-between"
                  paddingLeft={1}
                  paddingRight={1}
                  height={1}
                  {...(isSelected ? { backgroundColor: colors.primary } : {})}
                >
                  <text fg={isSelected ? colors.background : colors.text}>
                    {cmd.label}
                  </text>
                  {cmd.shortcut && (
                    <text fg={isSelected ? colors.background : colors.textSubtle}>
                      {cmd.shortcut}
                    </text>
                  )}
                </box>
              );
            })
          )}
        </box>
      </scrollbox>
      
      <box paddingLeft={1} paddingRight={1} height={1}>
        <text fg={colors.textSubtle}>↑↓ navigate  Enter select  Esc close</text>
      </box>
    </box>
  );
}
