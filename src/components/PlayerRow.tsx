import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "../design/theme";
import { RallyIcon } from "./RallyIcon";

type PlayerAction = "add" | "remove" | "pass" | "none";

type PlayerRowProps = {
  action?: PlayerAction;
  avatarInitials?: string | null;
  avatarUrl?: string | null;
  density?: "default" | "compact";
  meta?: string | null;
  name: string;
  onAction?: (action: Exclude<PlayerAction, "none">) => void;
  onSelectionChange?: (selected: boolean) => void;
  selected?: boolean;
  showDivider?: boolean;
};

export function PlayerRow({
  action = "none",
  avatarInitials,
  avatarUrl,
  density = "default",
  meta,
  name,
  onAction,
  onSelectionChange,
  selected = false,
  showDivider = true
}: PlayerRowProps) {
  const selectable = Boolean(onSelectionChange);

  return (
    <Pressable
      accessibilityHint={selectable ? "Toggles player selection" : undefined}
      accessibilityLabel={[name, meta, selected ? "Selected" : null].filter(Boolean).join(", ")}
      accessibilityRole={selectable ? "button" : "text"}
      accessibilityState={{ selected }}
      disabled={!selectable}
      onPress={() => onSelectionChange?.(!selected)}
      style={({ pressed }) => [
        styles.row,
        density === "compact" ? styles.rowCompact : null,
        showDivider ? null : styles.rowWithoutDivider,
        selected ? styles.rowSelected : null,
        pressed && selectable ? styles.rowPressed : null
      ]}
    >
      <View style={styles.avatar}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
        ) : (
          <Text numberOfLines={1} style={styles.avatarText}>
            {avatarInitials ?? initialsFor(name)}
          </Text>
        )}
      </View>
      <View style={styles.identity}>
        <Text style={styles.name}>{name}</Text>
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      </View>
      {action !== "none" ? (
        <Pressable
          accessibilityLabel={`${labelFor(action)} ${name}`}
          accessibilityRole="button"
          onPress={() => onAction?.(action)}
          style={({ pressed }) => [styles.action, pressed ? styles.actionPressed : null]}
        >
          {action === "add" ? (
            <RallyIcon color={theme.color.action.primary} name="add-player" size={theme.size.iconCompact} />
          ) : null}
          <Text style={styles.actionText}>{labelFor(action)}</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

function initialsFor(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function labelFor(action: Exclude<PlayerAction, "none">) {
  switch (action) {
    case "add":
      return "Add";
    case "remove":
      return "Remove";
    case "pass":
      return "Pass";
  }
}

const styles = StyleSheet.create({
  action: {
    alignItems: "center",
    borderRadius: theme.radius.control,
    flexDirection: "row",
    gap: theme.space[4],
    justifyContent: "center",
    minHeight: theme.size.targetMinimum,
    minWidth: theme.size.targetMinimum,
    paddingHorizontal: theme.space[8]
  },
  actionPressed: {
    backgroundColor: theme.color.surface.info
  },
  actionText: {
    ...theme.type.labelAction,
    color: theme.color.action.primary
  },
  avatar: {
    alignItems: "center",
    backgroundColor: theme.color.surface.info,
    borderRadius: theme.radius.pill,
    height: theme.size.avatarDefault,
    justifyContent: "center",
    overflow: "hidden",
    width: theme.size.avatarDefault
  },
  avatarImage: {
    height: "100%",
    width: "100%"
  },
  avatarText: {
    ...theme.type.bodySecondary,
    color: theme.color.text.selected,
    fontWeight: "600"
  },
  identity: {
    flex: 1,
    gap: theme.space[2],
    minWidth: 0
  },
  meta: {
    ...theme.type.bodySecondary,
    color: theme.color.text.secondary
  },
  name: {
    ...theme.type.titleCard,
    color: theme.color.text.primary,
    flexShrink: 1
  },
  row: {
    alignItems: "center",
    borderBottomColor: theme.color.border.subtle,
    borderBottomWidth: theme.border.quiet,
    flexDirection: "row",
    gap: theme.layout.inlineDefault,
    minHeight: theme.size.playerRowMinimumHeight,
    paddingVertical: theme.space[6]
  },
  rowCompact: {
    minHeight: theme.size.targetMinimum,
    paddingVertical: theme.space[0]
  },
  rowPressed: {
    backgroundColor: theme.color.surface.info
  },
  rowWithoutDivider: {
    borderBottomColor: "transparent",
    borderBottomWidth: 0
  },
  rowSelected: {
    backgroundColor: theme.color.surface.social,
    borderBottomColor: "transparent",
    borderRadius: theme.radius.control,
    paddingHorizontal: theme.space[12]
  }
});
