import { useKeyboard } from "@opentui/react";
import { useEffect, useState } from "react";
import { useInputFocus } from "../contexts/InputContext.tsx";
import { useColors } from "../contexts/ThemeContext.tsx";
import type { SortDirection, SortFieldDef } from "../types/sort.ts";
import { getSortDirectionIndicator } from "../types/sort.ts";
import { ModalBackdrop, Z_INDEX } from "./ModalBackdrop.tsx";

interface SortOverlayProps<F extends string = string> {
  fields: readonly SortFieldDef<F>[];
  currentField: F;
  currentDirection: SortDirection;
  onSelect: (field: F, direction: SortDirection) => void;
  onClose: () => void;
}

export function SortOverlay<F extends string>({
  fields,
  currentField,
  currentDirection,
  onSelect,
  onClose,
}: SortOverlayProps<F>) {
  const colors = useColors();
  const { setInputFocused } = useInputFocus();

  const [highlightedIndex, setHighlightedIndex] = useState(() => {
    const idx = fields.findIndex((f) => f.id === currentField);
    return idx === -1 ? 0 : idx;
  });

  const [pendingDirection, setPendingDirection] = useState<SortDirection>(currentDirection);

  // Capture input focus to block App.tsx and view-level keyboard handlers
  useEffect(() => {
    setInputFocused(true);
    return () => setInputFocused(false);
  }, [setInputFocused]);

  useKeyboard((key) => {
    // Navigation
    if (key.name === "up" || key.name === "k") {
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : fields.length - 1));
      return;
    }

    if (key.name === "down" || key.name === "j") {
      setHighlightedIndex((prev) => (prev < fields.length - 1 ? prev + 1 : 0));
      return;
    }

    // Toggle direction in-place
    if (key.name === "space" || key.sequence === " ") {
      setPendingDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    // Apply highlighted selection
    if (key.name === "return") {
      const field = fields[highlightedIndex];
      if (field) {
        onSelect(field.id, pendingDirection);
      }
      return;
    }

    // Cancel
    if (key.name === "escape") {
      onClose();
      return;
    }

    // Number quick-select: 1-9 selects field by position
    // If already sorting by that field, flip direction instead
    if (key.sequence && key.sequence.length === 1) {
      const digit = key.sequence.charCodeAt(0) - 48; // '0' = 48
      if (digit >= 1 && digit <= fields.length) {
        const field = fields[digit - 1];
        if (field) {
          const direction =
            field.id === currentField
              ? currentDirection === "desc"
                ? "asc"
                : "desc"
              : field.defaultDirection;
          onSelect(field.id, direction);
        }
        return;
      }
    }
  });

  return (
    <ModalBackdrop zIndex={Z_INDEX.MODAL} onBackdropClick={onClose}>
      <box
        width={34}
        flexDirection="column"
        border
        borderStyle="double"
        borderColor={colors.primary}
        backgroundColor={colors.background}
        overflow="hidden"
      >
        {/* Header */}
        <box height={1} justifyContent="center">
          <text fg={colors.primary} height={1}>
            Sort By
          </text>
        </box>

        {/* Sort Fields */}
        <box flexDirection="column">
          {fields.map((field, index) => {
            const isHighlighted = index === highlightedIndex;
            const isCurrent = field.id === currentField;

            const textColor = isHighlighted ? colors.background : colors.text;
            const numberColor = isHighlighted ? colors.background : colors.textMuted;
            const markerColor = isHighlighted ? colors.background : colors.primary;

            return (
              <box
                key={field.id}
                flexDirection="row"
                height={1}
                paddingLeft={1}
                paddingRight={1}
                justifyContent="space-between"
                {...(isHighlighted ? { backgroundColor: colors.primary } : {})}
              >
                {/* Left: number + marker + label + direction */}
                <text height={1}>
                  <span fg={numberColor}>{index + 1} </span>
                  <span fg={markerColor}>{isCurrent ? "● " : "  "}</span>
                  <span fg={textColor}>{field.label}</span>
                  {isHighlighted ? (
                    <span fg={colors.warning}> {getSortDirectionIndicator(pendingDirection)}</span>
                  ) : null}
                </text>
              </box>
            );
          })}
        </box>

        {/* Footer Hints */}
        <box flexDirection="column" paddingLeft={1} paddingRight={1} marginTop={1}>
          <box flexDirection="row" justifyContent="space-between" height={1}>
            <text fg={colors.textSubtle} height={1}>
              ↑↓ navigate
            </text>
            <text fg={colors.textSubtle} height={1}>
              Space toggle
            </text>
          </box>
          <box flexDirection="row" justifyContent="space-between" height={1}>
            <text fg={colors.textSubtle} height={1}>
              Enter apply
            </text>
            <text fg={colors.textSubtle} height={1}>
              Esc cancel
            </text>
          </box>
        </box>
      </box>
    </ModalBackdrop>
  );
}
