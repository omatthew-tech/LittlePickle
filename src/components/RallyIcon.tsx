import Svg, { Circle, Path, Rect } from "react-native-svg";

export type RallyIconName =
  | "add-player"
  | "back"
  | "camera"
  | "check"
  | "error"
  | "history"
  | "home"
  | "pencil"
  | "play"
  | "profile"
  | "scan"
  | "score"
  | "search"
  | "settings";

type RallyIconProps = {
  color: string;
  name: RallyIconName;
  size?: number;
};

export function RallyIcon({ color, name, size = 24 }: RallyIconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      {renderIcon(name, color)}
    </Svg>
  );
}

function renderIcon(name: RallyIconName, color: string) {
  switch (name) {
    case "add-player":
      return (
        <>
          <Circle cx="8.5" cy="7" r="3" />
          <Path d="M2.8 18.5c.5-3.7 2.4-5.4 5.7-5.4 2.1 0 3.7.7 4.7 2.2M18 8.5v7M14.5 12h7" />
        </>
      );
    case "back":
      return <Path d="M15 5 8 12l7 7" />;
    case "camera":
      return (
        <>
          <Path d="M8.2 6.5 9.5 4.8h5l1.3 1.7h2.5c1 0 1.7.8 1.7 1.7v8.6c0 1-.8 1.7-1.7 1.7H5.7c-1 0-1.7-.8-1.7-1.7V8.2c0-1 .8-1.7 1.7-1.7h2.5Z" />
          <Circle cx="12" cy="12.3" r="3.2" />
        </>
      );
    case "check":
      return <Path d="m4.5 12.5 4.2 4.2L19.5 6.5" />;
    case "error":
      return (
        <>
          <Circle cx="12" cy="12" r="9" />
          <Path d="M12 7.5v6M12 17.2h.01" />
        </>
      );
    case "history":
      return (
        <>
          <Path d="M5 7H2.8V4.8" />
          <Path d="M3.2 7.1A9 9 0 1 1 4 17.8" />
          <Path d="M12 7.2V12l3.4 2" />
        </>
      );
    case "home":
      return (
        <>
          <Path d="M3.5 11.2 12 4l8.5 7.2" />
          <Path d="M5.8 10.4V20h12.4v-9.6" />
          <Path d="M10 20v-5.2h4V20" />
        </>
      );
    case "pencil":
      return (
        <>
          <Path d="M4.5 19.5 8 18.7 18.6 8.1a2.1 2.1 0 0 0-3-3L5 15.7l-.5 3.8Z" />
          <Path d="m13.8 6.8 3.4 3.4" />
        </>
      );
    case "play":
      return (
        <>
          <Path d="M9.8 15.5c0-.6-.4-1-1.2-1.5l-.6-.4a4.3 4.3 0 0 1-2-3.7V5.2A3.2 3.2 0 0 1 9.2 2h5.6A3.2 3.2 0 0 1 18 5.2v4.7a4.3 4.3 0 0 1-2 3.7l-.6.4c-.8.5-1.2.9-1.2 1.5v5.7a1.4 1.4 0 0 1-1.4 1.4h-1.6a1.4 1.4 0 0 1-1.4-1.4v-5.7Z" />
          <Path d="M10.1 16.2h3.8m-3.7.9 3.6 1.5m-3.6.4 3.6 1.5m-3.6.4 3 1.3" strokeWidth={1.3} />
        </>
      );
    case "profile":
      return (
        <>
          <Circle cx="12" cy="7.2" r="3.2" />
          <Path d="M4.8 20c.6-4 3.1-6.1 7.2-6.1S18.6 16 19.2 20" />
        </>
      );
    case "scan":
      return (
        <>
          <Path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5" />
          <Path d="M8.5 8.3c3-2 6.7-.7 7.3 2.4.4 2.4-1.4 4.6-3.9 4.8" />
          <Circle cx="15.7" cy="8.4" r=".7" fill={color} stroke="none" />
        </>
      );
    case "score":
      return (
        <>
          <Rect x="3" y="5" width="18" height="14" rx="2.5" />
          <Path d="M12 5v14M7.5 9v6M16.5 9v6" />
        </>
      );
    case "search":
      return (
        <>
          <Circle cx="10.5" cy="10.5" r="5.5" />
          <Path d="m15 15 5 5" />
        </>
      );
    case "settings":
      return (
        <>
          <Path d="M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.3a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.3.4A2 2 0 0 0 4 9.9l.1.1a2 2 0 0 1 1 1.7v.6a2 2 0 0 1-1 1.7l-.1.1a2 2 0 0 0-.8 2.7l.3.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.3a2 2 0 0 1 1 1.7v.2a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.3a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.3-.4a2 2 0 0 0-.8-2.7l-.1-.1a2 2 0 0 1-1-1.7v-.6a2 2 0 0 1 1-1.7l.1-.1a2 2 0 0 0 .8-2.7l-.3-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.3a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2Z" />
          <Circle cx="12" cy="12" r="3" />
        </>
      );
  }
}
