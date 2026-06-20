# LittlePickle

LittlePickle is an iOS-first React Native app starter built from the approved light-mode mobile design system.

This project targets Expo SDK 54 for Expo Go compatibility on physical iPhones.

## Run the app

1. Install dependencies:

   ```sh
   npm install
   ```

2. Add Supabase settings:

   ```sh
   cp .env.example .env
   ```

   Then fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

3. Start iOS:

   ```sh
   npm run dev:lan
   ```

   On a physical iPhone, install Expo Go from the App Store and scan the QR code shown in the terminal.

   If your phone cannot connect over LAN, use:

   ```sh
   npm run dev:tunnel
   ```

   `npm run ios` is only for macOS machines with Xcode installed because it opens the iOS Simulator.

   If Expo Go says the project is incompatible, close the Expo dev server, run `npm install`, then restart with `npm run dev:clear`. The app should report SDK 54 in Expo CLI output.

## App scope

- Home follows the supplied QR/search wireframe.
- Play follows the supplied recommended match/current players wireframe.
- Profile is intentionally only a navigation destination for this release.
- Supabase is scaffolded in `src/lib/supabase.ts` and will not initialize until the Expo public env vars are set.

## Design system

- `LittlePickle_Design_System.md` - complete human-readable specification
- `visual/LittlePickle_Design_System_Reference.png` - visual reference board
- `tokens/littlepickle.tokens.json` - DTCG-style design tokens
- `contracts/littlepickle.components.json` - machine-readable component contracts
- `agents/AGENTS.md` - concise coding-agent rules
- `web/littlepickle.css` - optional web/prototype projection
- `icons/` - Rally Loop SVG icon set

The design system intentionally contains only six core components and two defined screen patterns.
