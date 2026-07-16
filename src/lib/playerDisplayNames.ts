type PlayerNameSource = {
  id: string;
  name: string;
};

export function playerDisplayNames(
  players: ReadonlyArray<PlayerNameSource>,
  currentPlayerId: string | null | undefined
) {
  const names = players.map((player) => {
    const fullName = normalizeDisplayName(player.name);

    return {
      ...nameParts(fullName),
      fullName,
      id: player.id
    };
  });

  return new Map(
    names.map(({ firstName, fullName, id, lastName }): [string, string] => {
      if (id === currentPlayerId) {
        return [id, fullName];
      }

      const matchingFirstNames = names.filter(
        (candidate) => candidate.firstName.toLowerCase() === firstName.toLowerCase()
      );

      if (matchingFirstNames.length < 2 || !lastName) {
        return [id, firstName];
      }

      const lastInitial = lastName[0] ?? "";
      const matchingLastInitials = matchingFirstNames.filter(
        (candidate) => candidate.lastName?.[0]?.toLowerCase() === lastInitial.toLowerCase()
      );

      return [
        id,
        matchingLastInitials.length > 1 ? `${firstName} ${lastName}` : `${firstName} ${lastInitial}`
      ];
    })
  );
}

function nameParts(name: string) {
  const parts = normalizeDisplayName(name).split(" ").filter(Boolean);

  return {
    firstName: parts[0] ?? name,
    lastName: parts.length > 1 ? parts[parts.length - 1] : null
  };
}

function normalizeDisplayName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}
