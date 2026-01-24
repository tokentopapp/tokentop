import { useColors } from '../contexts/ThemeContext.tsx';

export function HelpOverlay() {
  const colors = useColors();
  return (
    <box 
      position="absolute" 
      top="20%" 
      left="30%" 
      width={50} 
      height={20} 
      border 
      borderStyle="double" 
      borderColor={colors.primary} 
      flexDirection="column" 
      padding={1} 
      zIndex={10}
      backgroundColor={colors.background}
    >
      <box justifyContent="center"><text><strong>Help</strong></text></box>
      
      <box marginTop={1}><text fg={colors.primary}><strong>Navigation</strong></text></box>
      <box flexDirection="row"><text width={12} fg={colors.textMuted}>Tab</text><text>Switch panel focus</text></box>
      <box flexDirection="row"><text width={12} fg={colors.textMuted}>↑/↓ j/k</text><text>Navigate sessions</text></box>
      <box flexDirection="row"><text width={12} fg={colors.textMuted}>Enter</text><text>View details</text></box>
      
      <box marginTop={1}><text fg={colors.primary}><strong>Actions</strong></text></box>
      <box flexDirection="row"><text width={12} fg={colors.textMuted}>/</text><text>Filter sessions</text></box>
      <box flexDirection="row"><text width={12} fg={colors.textMuted}>s</text><text>Toggle sort</text></box>
      <box flexDirection="row"><text width={12} fg={colors.textMuted}>t</text><text>Cycle time window</text></box>
      <box flexDirection="row"><text width={12} fg={colors.textMuted}>i</text><text>Toggle sidebar</text></box>
      <box flexDirection="row"><text width={12} fg={colors.textMuted}>r</text><text>Refresh data</text></box>
      
      <box marginTop={1}><text fg={colors.primary}><strong>General</strong></text></box>
      <box flexDirection="row"><text width={12} fg={colors.textMuted}>1-5</text><text>Switch views</text></box>
      <box flexDirection="row"><text width={12} fg={colors.textMuted}>:</text><text>Command palette</text></box>
      <box flexDirection="row"><text width={12} fg={colors.textMuted}>q</text><text>Quit</text></box>
      
      <box justifyContent="center" marginTop={1}><text fg={colors.textMuted}>Press ? or Esc to close</text></box>
    </box>
  );
}
