import Svg, { Circle, Path, Rect } from "react-native-svg";

export type RallyIconName =
  | "add-player"
  | "back"
  | "check"
  | "error"
  | "history"
  | "home"
  | "play"
  | "profile"
  | "scan"
  | "score"
  | "search";

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
    case "play":
      return (
        <>
          <Rect x="5.5" y="2.8" width="8.2" height="9.4" rx="3" />
          <Path d="m9.2 12 1 7.2" />
          <Circle cx="18.2" cy="6.6" r="1.8" />
          <Path d="M14.7 3.8c3.8-2 7.1.5 6.6 4.3" />
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
  }
}
