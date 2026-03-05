import { useTerminalDimensions } from "@opentui/react";
import { useColors } from "../contexts/ThemeContext.tsx";
import { ModalBackdrop, Z_INDEX } from "./ModalBackdrop.tsx";

export function HelpOverlay() {
  const colors = useColors();
  const { height: termHeight } = useTerminalDimensions();
  const isCompact = termHeight < 28;

  return (
    <ModalBackdrop zIndex={Z_INDEX.MODAL}>
      <box
        width={46}
        height={isCompact ? 18 : 20}
        border
        borderStyle="double"
        borderColor={colors.primary}
        flexDirection="column"
        padding={1}
        backgroundColor={colors.background}
        overflow="hidden"
      >
        <box justifyContent="center" height={1}>
          <text height={1}>
            <strong>Help</strong>
          </text>
        </box>

        <box height={1} marginTop={1}>
          <text height={1} fg={colors.primary}>
            <strong>Navigation</strong>
          </text>
        </box>
        <box flexDirection="row" height={1}>
          <text width={10} height={1} fg={colors.textMuted}>
            ↑↓ j/k
          </text>
          <text height={1}>Navigate</text>
        </box>
        <box flexDirection="row" height={1}>
          <text width={10} height={1} fg={colors.textMuted}>
            Enter
          </text>
          <text height={1}>View details</text>
        </box>

        <box height={1} marginTop={1}>
          <text height={1} fg={colors.primary}>
            <strong>Actions</strong>
          </text>
        </box>
        <box flexDirection="row" height={1}>
          <text width={10} height={1} fg={colors.textMuted}>
            /
          </text>
          <text height={1}>Filter</text>
        </box>
        <box flexDirection="row" height={1}>
          <text width={10} height={1} fg={colors.textMuted}>
            s
          </text>
          <text height={1}>Sort menu</text>
        </box>
        <box flexDirection="row" height={1}>
          <text width={10} height={1} fg={colors.textMuted}>
            t
          </text>
          <text height={1}>Time window</text>
        </box>

        <box height={1} marginTop={1}>
          <text height={1} fg={colors.primary}>
            <strong>Global</strong>
          </text>
        </box>
        <box flexDirection="row" height={1}>
          <text width={10} height={1} fg={colors.textMuted}>
            1-4
          </text>
          <text height={1}>Switch views</text>
        </box>
        <box flexDirection="row" height={1}>
          <text width={10} height={1} fg={colors.textMuted}>
            ,
          </text>
          <text height={1}>Settings</text>
        </box>
        <box flexDirection="row" height={1}>
          <text width={10} height={1} fg={colors.textMuted}>
            :
          </text>
          <text height={1}>Command palette</text>
        </box>
        <box flexDirection="row" height={1}>
          <text width={10} height={1} fg={colors.textMuted}>
            ~
          </text>
          <text height={1}>Debug panel</text>
        </box>
        <box flexDirection="row" height={1}>
          <text width={10} height={1} fg={colors.textMuted}>
            q
          </text>
          <text height={1}>Quit</text>
        </box>

        <box justifyContent="center" height={1} marginTop={1}>
          <text height={1} fg={colors.textMuted}>
            ? or Esc to close
          </text>
        </box>
      </box>
    </ModalBackdrop>
  );
}
