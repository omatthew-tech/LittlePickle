const leagueSchemePrefix = "littlepickle://league/";

export function leagueQrValue(slug: string) {
  return `${leagueSchemePrefix}${encodeURIComponent(slug)}`;
}

export function parseLeagueQrValue(rawValue: string) {
  const value = rawValue.trim();

  if (!value) {
    return "";
  }

  const lowerValue = value.toLowerCase();

  if (lowerValue.startsWith(leagueSchemePrefix)) {
    return decodeURIComponent(value.slice(leagueSchemePrefix.length)).trim();
  }

  try {
    const url = new URL(value);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const leagueIndex = pathParts.findIndex((part) => part.toLowerCase() === "league");
    const pathCode = pathParts[leagueIndex + 1];

    if (leagueIndex >= 0 && pathCode) {
      return decodeURIComponent(pathCode).trim();
    }

    const code = url.searchParams.get("league");

    if (code) {
      return code.trim();
    }
  } catch {
    return "";
  }

  return "";
}
